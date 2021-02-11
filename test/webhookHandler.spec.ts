import assert from 'assert';
import * as dotenv from 'dotenv';
import sinon, { SinonSpy, SinonStub } from 'sinon';
import { Request } from 'express';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { CloudTasksClient } from '@google-cloud/tasks';

import { webhookHandler } from '../src'

describe(' > Manually run Task Storage', () => {
  const mysqlExecuteStub: SinonStub = sinon.stub();
  let cloudClientCreateTaskStub: SinonStub;

  const ONE_ROW_UPDATED = [{ affectedRows: 1 }];

  // // Mock ExpressJS 'req' and 'res' parameters
  const req: Request = {
    query: {},
    body: {},
  } as any;

  let res: any;

  beforeEach(async function beforeEach() {
    sinon.spy(console, 'log');
    sinon.spy(console, 'error');

    res = {
      send: sinon.stub(),
      status: sinon.stub().returnsThis() // fluent
    } as any;

    // avoid GCP calls to access real Secret Manager:
    sinon.stub(SecretManagerServiceClient.prototype, 'accessSecretVersion').returns(
      [{ payload: { data: "test-secret" } }] as any
    );

    mysqlExecuteStub.resetHistory();
    const stubMysql = sinon.stub(require('mysql2/promise'))
    const connectionDbStub = sinon.stub() as any;
    connectionDbStub.execute = mysqlExecuteStub;
    connectionDbStub.beginTransaction = sinon.stub().resolves();
    connectionDbStub.commit = sinon.stub().resolves();
    connectionDbStub.rollback = sinon.stub().resolves();
    connectionDbStub.end = sinon.stub();
    stubMysql.createConnection.resolves(connectionDbStub);

    // avoid GCP calls to create real Tasks:
    sinon.stub(CloudTasksClient.prototype, 'queuePath').returns('/proj/uscentral1/queue/qname');
    sinon.stub(CloudTasksClient.prototype, 'taskPath').returns('/proj/uscentral1/queue/qname/task/tname');
    cloudClientCreateTaskStub = sinon.stub(CloudTasksClient.prototype, 'createTask')

    delete process.env.WEBHOOK_TASK_QUEUE_EASYPOST;
    delete process.env.WEBHOOK_FUNCTION_URL_EASYPOST;
    dotenv.config({ path: './test/.env' });
  });

  afterEach(async function afterEach() {
    (console.log as SinonSpy).restore();
    (console.error as SinonSpy).restore();

    mysqlExecuteStub.reset();
    sinon.restore();
  });

  /**
   * We want to verify this right after testing our "system" under test
   * Asserting this first ensures our other assertions should pass.
   */
  function assertResponseSuccess(): void {
    // Verify *first* behavior of tested function
    assert.ok(res.send.calledOnce, "Send called once.");
    const [functionResponse] = res.send.firstCall.args;
    assert.ok(functionResponse.startsWith('success'), `'${functionResponse}' doesn't start with 'success'`);

    assert.deepStrictEqual([200], res.status.firstCall.args);
  }

  const setupUnstubbedQueryThrows = (): void => {
    mysqlExecuteStub.callThrough().callsFake(function queryMissing(query, params) {
      throw new Error(`Unexpected conn.execute (no conditionals matched): ${JSON.stringify([query, params])}`);
    });
  }

  const getAutoIncrementResult = (newId: number) => {
    return [{
      fieldCount: 0,
      affectedRows: 1,
      insertId: newId,
      info: '',
      serverStatus: 2,
      warningStatus: 0
    }]
  }

  const setupTaskStorageInsert = (newId: number): SinonStub => {
    const insertTaskStorage = mysqlExecuteStub.withArgs(
      'INSERT INTO task_storage (queue_name, task_id, storage_contents) VALUES (?, ?, ?);',
      sinon.match.any
    ).resolves(getAutoIncrementResult(newId));
    return insertTaskStorage;
  }

  const setupTaskStorageUpdate = (taskStorageId: number): SinonStub => {
    return mysqlExecuteStub
        .withArgs(sinon.match(/^UPDATE task_storage\s+SET task_created=1\s+WHERE id=\?;$/s), [taskStorageId])
        .resolves(ONE_ROW_UPDATED);
  }

  it('Webhook should receive incoming request and create a task (and store task payload).', async () => {

    dotenv.config();

    req.body = {
      object: 'Event',
      id: 'evt_12345',
      whatever: true
    };
    req.headers = {
      'content-type': 'application/json',
      authorization: 'Basic dXNlcm5hbWU6cDRzc3cwcmQ=' // we get 'Authorization' from Easypost, but expressjs/google changes to 'authorization'
    };

    setupUnstubbedQueryThrows();

    // what Cloud client task creates.
    cloudClientCreateTaskStub.withArgs(sinon.match.any).resolves([{ name: 'xx' }]);

    const taskStorageInsert = setupTaskStorageInsert(1234);
    const taskStorageUpdate = setupTaskStorageUpdate(1234);

    await webhookHandler(req, res);

    assertResponseSuccess();

    const bodyText = Buffer.from(JSON.stringify({
      taskStorageId: 1234
    })).toString('base64');

    assert.ok(cloudClientCreateTaskStub.calledOnce, "expecting task creation to be called.")
    assert.deepStrictEqual(cloudClientCreateTaskStub.firstCall.args, [{ // ICreateTaskRequest
      parent: '/proj/uscentral1/queue/qname',
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: 'https://us-central1-<your-project-id>.cloudfunctions.net/no-such-function',
          body: bodyText,
          headers: {
            'content-type': 'application/json' // ensures body will be an object
          },
          oidcToken: {
            serviceAccountEmail: '<your-project-id>@appspot.gserviceaccount.com'
          }
        },
        name: '/proj/uscentral1/queue/qname/task/tname',
        // scheduleTime: {
        //   seconds: 1591989520.95
        // }
      },
      responseView: 'FULL'
    }]);

    assert.ok(taskStorageInsert.calledOnce, 'expecting task_storage to be inserted (for Queue function payload)');
    assert.ok(taskStorageUpdate.calledOnce, 'expecting task_storage to be marked as processed');
  });

  it('Webhook should ignore incoming webhooks that cannot create pre-existing tasks by id.', async () => {

    dotenv.config();

    req.body = {
      object: 'Event',
      id: 'evt_12345',
      whatever: true
    };
    req.headers = {
      'content-type': 'application/json',
      authorization: 'Basic dXNlcm5hbWU6cDRzc3cwcmQ=' // we get 'Authorization' from Easypost, but expressjs/google changes to 'authorization'
    };

    setupUnstubbedQueryThrows();

    // what Cloud client task creates.
    cloudClientCreateTaskStub.withArgs(sinon.match.any).throws(new Error('6 ALREADY_EXISTS: The task cannot be created because a task with this name existed too recently.'));

    const taskStorageInsert = setupTaskStorageInsert(1234);
    const taskStorageUpdate = setupTaskStorageUpdate(1234);

    await webhookHandler(req, res);

    assertResponseSuccess();

    assert.ok(cloudClientCreateTaskStub.calledOnce, "expecting task creation to be called.");
    assert.ok(cloudClientCreateTaskStub.firstCall.threw, 'expect that the call to create a cloud task threw')

    assert.ok(taskStorageInsert.calledOnce, 'expecting task_storage to be inserted (for Queue function payload)');
    assert.deepStrictEqual(taskStorageInsert.firstCall.args[1], [
      'test-queue',
      'evt_12345',
      '{"object":"Event","id":"evt_12345","whatever":true}'
    ])
    assert.ok(taskStorageUpdate.notCalled, 'expecting task_storage to be marked as processed');
  });
});