import dotenv from 'dotenv';
import { Request, Response } from 'express';
import { Connection } from 'mysql2/promise';
import { createTask } from './CloudTaskCreator';

import { getConnection, addTaskStorage, setTaskStorageTaskCreated } from './DatabaseConnector';

dotenv.config();

const WEBHOOK_FUNCTION_URL_EASYPOST = 'WEBHOOK_FUNCTION_URL_EASYPOST';
const WEBHOOK_INCOMING_QUEUE_NAME = 'WEBHOOK_INCOMING_QUEUE_NAME';

/**
 * We can extend this later.  Right now it's just setup for EasyPost.
 * Configured on their side with an endpoint like:
 * https://username:p4ssw0rd@your-site.ngrok.io/easypost-webhook
 *
 * NOTE: easypost is gracious with their 7 second time for an allowed response.
 * The cold start is around 2-3 seconds max on Node, so we will have lots of time left over.
 * We make only 2 db calls and 1 task creation call - plus smallish node_modules.
 *
 * @param {!express:Request} req  Cloud Function HTTP request context.
 *                                More info: https://expressjs.com/en/api.html#req
 * @param {!express:Response} res HTTP response context.
 *                                More info: https://expressjs.com/en/api.html#res
 */
export const webhookHandler = async (req: Request, res: Response) => {
  let connection: Connection | undefined;
  try {
    connection = await getConnection();
    if (!req.headers.authorization) {
      return res.status(403).json({ error: 'No credentials sent!' });
    }

    // could check for " " first...
    const authCredentials: string = Buffer.from(req.headers.authorization.split(" ")[1], 'base64').toString();
    const [username, password] = authCredentials.split(':');

    if (username !== 'username' && password !== 'p4ssw0rd') {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // guard clauses ensure minimum environment available:
    const requiredEnvironmentVariables = [
      WEBHOOK_FUNCTION_URL_EASYPOST,
      WEBHOOK_INCOMING_QUEUE_NAME,
      'DB_USER',
      'DB_NAME'
    ]

    const missingEnvironmentVariables: string[] = [];
    requiredEnvironmentVariables.forEach(requiredEnvironmentVariable => {
      if (process.env[requiredEnvironmentVariable] === undefined) {
        missingEnvironmentVariables.push(requiredEnvironmentVariable)
      }
    })
    if (missingEnvironmentVariables.length > 0) {
      res.status(500).send(`missing environment variables: [${missingEnvironmentVariables.join(',')}]`);
      return;
    }

    const easypostDestination = {
      name: 'Easypost Webhook Processor',
      cloudTaskQueueName: process.env[WEBHOOK_INCOMING_QUEUE_NAME]!,
      cloudFunctionUrl: process.env[WEBHOOK_FUNCTION_URL_EASYPOST]!
    }

    // if we add webhooks other than Easypost then it may not be POSTed application/json.
    // typically here we identify which party sent us a webhook we push to a specific queue + function and reply 200.
    const requestBody = req.body;

    if (!requestBody.id) {
      res.status(500).send("no 'id' found on the response for idempotency");
      return;
    }

    // https://www.easypost.com/docs/api#events
    // id is the unique identifier - we use it for idempotency and deduping on the side of the queue
    const { id } = requestBody;

    // intentionally opted to not have this in a transaction to provide visibility on insert to task_storage that are not marked 'task_created = 1'.
    const taskStorageId: number | undefined = await addTaskStorage(connection, easypostDestination.cloudTaskQueueName, id, JSON.stringify(req.body));

    let taskName: string;
    try {
      taskName = await createTask(
        easypostDestination.cloudFunctionUrl,
        easypostDestination.cloudTaskQueueName,
        id, // used for idempotency/de-duping
        taskStorageId!
      );
    } catch (taskError) {
      // if we throw a 500 this ID will be tried 6 times.  We opt to send a 200 assuming that the other one would have processed the order further
      // additionally, we have the data not marked as "created", so we can find issues that way as well.
      console.error(`Error creating task ${id}.  Checking for queue deduplication message.`);
      if ('message' in taskError) {
        const isDuplicate = (taskError.message ?? '').indexOf('ALREADY_EXISTS: The task cannot be created because a task with this name existed too recently.') >= 0;
        if (isDuplicate) {
          console.log('Returning HttpStatus OK - will not retry as GCP queue has identified as a duplicate.')
          res.status(200).send('success.');
          return;
        }
      }
      throw taskError;
    }

    console.log(` > Task created for: ${taskName} on '${easypostDestination.cloudTaskQueueName}'.`);

    const success = await setTaskStorageTaskCreated(connection, taskStorageId!);
    if (success) {
      res.status(200).send('success.');
    } else {
      res.status(500).send('request retry');
    }
  } catch (e) {
    console.error("error processing incoming webhook.")
    console.error(e);
    res.status(500).send('Internal Server Error');

    throw e; // registers errors better than 500 in stackdriver
  } finally {
    if (connection) {
      connection.end();
    }
  }
}