import { CloudTasksClient } from '@google-cloud/tasks';
import * as protos from '@google-cloud/tasks/build/protos/protos';

const GCP_PROJECT_ID = '<your-project-id>'; // or store as github repo secret
const CLOUD_REGION_NAME = 'us-central1';
// This is the service account credentials the task sends to function.
const SERVICE_ACCOUNT_EMAIL = `${GCP_PROJECT_ID}@appspot.gserviceaccount.com`;

/**
 *
 * NOTE: was originally attaching the file contents as part of task payload.  The max size, however, is 100KB and now task_storage table
 * is used for the file contents.  This provides also ability to replay stream of events to another data projection.
 */
export const createTask = async (cloudFunctionUrl: string, cloudTaskQueueName: string, eventId: string, taskStorageId: number): Promise<string> => {
    const client = new CloudTasksClient();

    // Construct the fully qualified queue name.
    const parent = client.queuePath(GCP_PROJECT_ID, CLOUD_REGION_NAME, cloudTaskQueueName);

    // Task ID can contain only letters ([A-Za-z]), numbers ([0-9]), hyphens (-), or underscores (_)
    const taskId = eventId.replace(/[^A-Za-z0-9-_]/ig, '__');
    const taskName = client.taskPath(GCP_PROJECT_ID, CLOUD_REGION_NAME, cloudTaskQueueName, taskId);

    const bodyText = JSON.stringify({
        taskStorageId
    });

    const request: protos.google.cloud.tasks.v2.ICreateTaskRequest = { // ICreateTaskRequest
        parent,
        task: {
            httpRequest: {
                httpMethod: 'POST' as any as protos.google.cloud.tasks.v2.HttpMethod,
                url: cloudFunctionUrl,
                body: Buffer.from(bodyText).toString('base64'),
                headers: {
                    // https://cloud.google.com/functions/docs/writing/http#parsing_http_requests
                    'content-type': 'application/json'
                },
                oidcToken: {
                    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL
                }
            },
            name: taskName
        },
        responseView: 'FULL'
    };

    const [response] = await client.createTask(request);
    console.log(`Created task ${response.name}`);
    return response.name!; // always has a name
}

/**
 * Can be used to retrieve a task stuck in the queue for building tests.
 */
export const getTask = async (cloudTaskQueueName: string, taskId: string): Promise<protos.google.cloud.tasks.v2.ITask> => {
    const client = new CloudTasksClient();

    const taskName = client.taskPath(GCP_PROJECT_ID, CLOUD_REGION_NAME, cloudTaskQueueName, taskId);
    const request: protos.google.cloud.tasks.v2.IGetTaskRequest = { // ICreateTaskRequest
        name: taskName,
        responseView: 'FULL'
    };

    const [response] = await client.getTask(request);
    // task.httpRequest.body.toString('utf8')
    return response;
}