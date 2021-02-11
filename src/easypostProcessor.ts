// https://www.easypost.com/docs/api#events

import dotenv from 'dotenv';
import { Request, Response } from 'express';
import { Connection } from 'mysql2/promise';

import { getConnection, getTaskStorage, TaskStorage, setTaskStorageProcessed } from './DatabaseConnector';
import { Nullable } from './Types';
import { EasypostWebhookEvent, EasypostTrackingDetails } from './EasypostTypes';
dotenv.config()

/**
 * Responds to any HTTP request.
 * Expecting a POST with taskStorageId that is a JSON body from webhook.
 *
 * @param {!express:Request} req  Cloud Function HTTP request context.
 *                                More info: https://expressjs.com/en/api.html#req
 * @param {!express:Response} res HTTP response context.
 *                                More info: https://expressjs.com/en/api.html#res
 */
export const easypostProcessor = async (req: Request, res: Response) => {

  // POSTed as application/json, so body is an Object (https://cloud.google.com/functions/docs/writing/http#sample_usage)
  const { taskStorageId } = req.body;

  // stackdriver GCP logging for recovery purposes
  console.log(`Incoming Easypost Webhook received: ${JSON.stringify(req.body)}`);

  if (taskStorageId === undefined) {
    // ensure application/json for Cloud Function to parse as JSON:
    res.status(500).send(`'taskStorageId' not supplied.  content-type: ${req.headers['content-type']}`);
    return;
  }

  let connection: Connection | undefined;
  let inTransaction = false;
  try {
    connection = await getConnection();
    const taskStorage: Nullable<TaskStorage> = await getTaskStorage(connection, taskStorageId);

    if (taskStorage === null) {
      console.error(`TaskStorage not found '${taskStorageId}'.`)
      res.status(200).send('success (no rows)');
      return;
    }

    if (taskStorage.processed === 1) {
      console.error(`TaskStorage already marked as processed '${taskStorageId}' (we don't want to reprocess - idempotent skip).`)
      res.status(200).send('success (already processed)');
      return;
    }

    let easypostWebhook: EasypostWebhookEvent;
    try {
      easypostWebhook = JSON.parse(taskStorage.storage_contents) as EasypostWebhookEvent;
    } catch (e) {
      // this will stay on the queue and we will detect webhooks with content not in JSON
      res.status(500).send("Cannot parse storage contents");
      return;
    }

    const { object, mode, description } = easypostWebhook;
    // https://www.easypost.com/docs/api#possible-event-types
    const TRACKER_UPDATED = 'tracker.updated'; // tracker.created
    const TRACKER_UPDATED_STATUS_DELIVERED = 'delivered';

    if (object !== 'Event' || mode !== 'production' || description !== TRACKER_UPDATED) {
      console.log(` > skipping ${object} '${description}' in prod ${(mode === 'production' ? 'yes' : 'no')}`)
      res.status(200).send('success');
      return;
    }

    const tracker = easypostWebhook.result;
    let message = '';
    for (const trackingDetail of tracker.tracking_details.reverse()) {
      if (trackingDetail.status === tracker.status) {
        message += `${tracker.carrier} says: ${trackingDetail.message} in ${trackingDetail.tracking_location.city}.`;
        break;
      }
    }

    if (tracker.status !== TRACKER_UPDATED_STATUS_DELIVERED) {
      // TODO: disable this log once we confirm everything is working as expected.
      console.log(` > skipping tracker update for '${easypostWebhook.status}' NOT ${TRACKER_UPDATED_STATUS_DELIVERED}.  ${message}`);
      res.status(200).send('success');
      return;
    }

    const deliveredTrackingDetails: EasypostTrackingDetails[] = tracker.tracking_details.filter(td => td.status === TRACKER_UPDATED_STATUS_DELIVERED);
    const trackingId = tracker.tracking_code;

    /**
     * Here you retrieve your shipment by the trackingId or other means and you can do SMS notification or email notifications, etc.
     */
    // const shipment: Nullable<TrackingShipment> = await getShipmentByTrackingId(connection, trackingId);
    // if (shipment === null || deliveredTrackingDetails.length === 0) {
    //   console.error(`Shipment ${shipment === null ? 'was' : 'not'} found by tracking code '${trackingId}'.  Delivered detail count: ${deliveredTrackingDetails}`);
    //   res.status(200).send('success');
    //   return;
    // }

    inTransaction = true;
    // delivered datetime is ISO: "2021-02-04T18:00:44Z" zulu tz parses on node.
    const deliveryDate: Date = new Date(Date.parse(deliveredTrackingDetails[0].datetime));
    // await connection.beginTransaction();
    // const orderProcessed: boolean = await processOrder(connection, shipment.orderNumber, deliveryDate, trackingId);
    // console.log(`Processed Order: '${shipment.orderNumber}'`);
    const successMarkProcessed = await setTaskStorageProcessed(connection, taskStorageId);

    // if (orderProcessed === true && successMarkProcessed === true) {
    //   await connection.commit();
    // } else {
    //   // console.error(`Unable to update order '${shipment.orderNumber}' and mark storage '${successMarkProcessed}'`)
    //   await connection.rollback();
    //   res.status(500).send('Internal Server Error');
    //   return;
    // }
  } catch (e) {
    // if (inTransaction === true) {
    //   await connection!.rollback();
    // }
    console.error("error processing easypost webhook.");
    console.error(e);
    res.status(500).send('Internal Server Error');
    return;
  } finally {
    if (connection) {
      connection.end();
    }
  }

  res.status(200).send(`Processed easypost webhook delivered event.`);
};
