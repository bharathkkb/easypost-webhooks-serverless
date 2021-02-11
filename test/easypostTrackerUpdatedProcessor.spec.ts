import assert from 'assert';
import * as dotenv from 'dotenv';
import sinon, { SinonSpy, SinonStub } from 'sinon';
import { Request } from 'express';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

import { easypostProcessor } from '../src'
import { EasypostWebhookEvent } from '../src/EasypostTypes';
import { TaskStorage } from '../src/DatabaseConnector';

describe(' > Process Tracker Updates from Easypost webhook payload (other events are ignored)', () => {
  const mysqlExecuteStub: SinonStub = sinon.stub();

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
  function assertResponseCompleted(): void {
    // Verify *first* behavior of tested function
    assert.ok(res.send.calledOnce, "Send called once.");
    const [functionResponse] = res.send.firstCall.args;
    assert.ok(functionResponse === 'Processed easypost webhook delivered event.', `'${functionResponse}' not final delivery method'`);

    assert.deepStrictEqual([200], res.status.firstCall.args);
  }

  const setupUnstubbedQueryThrows = (): void => {
    mysqlExecuteStub.callThrough().callsFake(function queryMissing(query, params) {
      throw new Error(`Unexpected conn.execute (no conditionals matched): ${JSON.stringify([query, params])}`);
    });
  }

  const setupTaskStorageRetrieval = (taskStorageId: number, webhookEvent: EasypostWebhookEvent): SinonStub => {
    return mysqlExecuteStub
      .withArgs('SELECT queue_name, task_id, storage_contents, processed FROM task_storage WHERE `id`=?;', [taskStorageId])
      .resolves([
        [
          {
            queue_name: 'test',
            task_id: 'evt_12345',
            storage_contents: JSON.stringify(webhookEvent),
            processed: 0
          } as TaskStorage
        ],
        undefined /* fields are ignored/ */
      ])
  }

  const setupTaskStorageMarkProcessed = (taskStorageId: number): SinonStub => {
    return mysqlExecuteStub
      .withArgs(sinon.match(/^UPDATE task_storage\s+SET processed=1\s+WHERE id=\?;$/s), [taskStorageId])
      .resolves(ONE_ROW_UPDATED);
  }

  it('Easypost processor should detect tracker update - update customer comment and set shipment "actual" ship date.', async () => {

    dotenv.config();

    req.body = {
      taskStorageId: 1234
    };
    req.headers = {
      'content-type': 'application/json',
    };

    const webhookEvent: EasypostWebhookEvent = {
      "description": "tracker.updated",
      "mode": "production",
      "previous_attributes": {
        "status": "in_transit"
      },
      "created_at": "2021-02-09T00:07:44.000Z",
      "pending_urls": ["https://username:p4ssw0rd@your-site.ngrok.io/easypost-webhook"],
      "completed_urls": [],
      "updated_at": "2021-02-09T00:07:44.000Z",
      "id": "evt_123",
      "user_id": "user_123",
      "status": "pending",
      "object": "Event",
      "result": {
        "id": "trk_123",
        "object": "Tracker",
        "mode": "production",
        "tracking_code": "12345",
        "status": "delivered",
        "status_detail": "unknown",
        "created_at": "2021-02-04T22:25:43Z",
        "updated_at": "2021-02-09T00:06:44Z",
        "signed_by": null,
        "weight": null,
        "est_delivery_date": "2021-02-10T00:00:00Z",
        "shipment_id": "shp_123",
        "carrier": "CanadaPost",
        "tracking_details": [{
          "object": "TrackingDetail",
          "message": "Item processed",
          "description": null,
          "status": "in_transit",
          "status_detail": "unknown",
          "datetime": "2021-02-04T18:00:44Z",
          "source": "CanadaPost",
          "carrier_code": "0100",
          "tracking_location": {
            "object": "TrackingLocation",
            "city": "CITY",
            "state": "BC",
            "country": null,
            "zip": null
          }
        }, {
          "object": "TrackingDetail",
          "message": "Electronic information submitted by shipper",
          "description": null,
          "status": "pre_transit",
          "status_detail": "unknown",
          "datetime": "2021-02-05T00:12:44Z",
          "source": "CanadaPost",
          "carrier_code": "3000",
          "tracking_location": {
            "object": "TrackingLocation",
            "city": null,
            "state": null,
            "country": null,
            "zip": null
          }
        }, {
          "object": "TrackingDetail",
          "message": "Shipment picked up by Canada Post",
          "description": null,
          "status": "in_transit",
          "status_detail": "unknown",
          "datetime": "2021-02-05T17:04:06Z",
          "source": "CanadaPost",
          "carrier_code": "2300",
          "tracking_location": {
            "object": "TrackingLocation",
            "city": "CITY",
            "state": "BC",
            "country": null,
            "zip": null
          }
        }, {
          "object": "TrackingDetail",
          "message": "Item processed",
          "description": null,
          "status": "in_transit",
          "status_detail": "unknown",
          "datetime": "2021-02-08T08:45:18Z",
          "source": "CanadaPost",
          "carrier_code": "0170",
          "tracking_location": {
            "object": "TrackingLocation",
            "city": "DESTINATION_CITY",
            "state": "BC",
            "country": null,
            "zip": null
          }
        }, {
          "object": "TrackingDetail",
          "message": "Item out for delivery",
          "description": null,
          "status": "out_for_delivery",
          "status_detail": "unknown",
          "datetime": "2021-02-08T13:16:45Z",
          "source": "CanadaPost",
          "carrier_code": "0174",
          "tracking_location": {
            "object": "TrackingLocation",
            "city": "DESTINATION_CITY",
            "state": "BC",
            "country": null,
            "zip": null
          }
        }, {
          "object": "TrackingDetail",
          "message": "Delivered to your community mailbox, parcel locker or apt./condo mailbox",
          "description": null,
          "status": "delivered",
          "status_detail": "unknown",
          "datetime": "2021-02-08T16:35:17Z",
          "source": "CanadaPost",
          "carrier_code": "1441",
          "tracking_location": {
            "object": "TrackingLocation",
            "city": "DESTINATION_CITY",
            "state": "BC",
            "country": null,
            "zip": null
          }
        }],
        "carrier_detail": {
          "object": "CarrierDetail",
          "service": null,
          "container_type": null,
          "est_delivery_date_local": null,
          "est_delivery_time_local": null,
          "origin_location": "CITY BC",
          "origin_tracking_location": {
            "object": "TrackingLocation",
            "city": "CITY",
            "state": "BC",
            "country": null,
            "zip": null
          },
          "destination_location": "H0H0H0",
          "destination_tracking_location": {
            "object": "TrackingLocation",
            "city": null,
            "state": null,
            "country": null,
            "zip": "H0H0H0"
          },
          "guaranteed_delivery_date": null,
          "alternate_identifier": null,
          "initial_delivery_attempt": "2021-02-08T16:35:17Z"
        },
        "finalized": true,
        "is_return": false,
        "public_url": "https://track.easypost.com/123"
      }
    };

    const taskStorageRetrieval = setupTaskStorageRetrieval(1234, webhookEvent);
    const taskStorageMarkedAsProcessed = setupTaskStorageMarkProcessed(1234);

    setupUnstubbedQueryThrows();

    await easypostProcessor(req, res);

    assertResponseCompleted();

    assert.ok(taskStorageRetrieval.calledOnce, 'expecting task retrieval to have been called')
    assert.ok(taskStorageMarkedAsProcessed.calledOnce, 'expecting task_storage to be marked as processed');
  });
});