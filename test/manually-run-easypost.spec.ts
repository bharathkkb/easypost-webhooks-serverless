import * as dotenv from 'dotenv';
import sinon from 'sinon';
import { Request } from 'express';

import { easypostProcessor } from '../src/easypostProcessor'

describe.skip(' > Manually run Task Storage', () => {
  // // Mock ExpressJS 'req' and 'res' parameters
  const req: Request = {
    query: {},
    body: {},
  } as any;

  let res: any;

  beforeEach(async function beforeEach() {
    res = {
        send: sinon.stub(),
        status: sinon.stub().returnsThis() // fluent
    } as any
  });

  it.skip('Manually process easypost stored tasks.', async () => {

    dotenv.config();

    // select * from task_storage where queue_name='prod-easypost-webhook' and processed=0 order by id;
    const taskStorageIds: number[] = [/*421*/];

    for (const taskStorageId of taskStorageIds) {

      req.body = {
        taskStorageId
      };

      await easypostProcessor(req, res);
    }
  });
});