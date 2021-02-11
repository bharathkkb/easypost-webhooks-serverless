import express, { Request, Response, NextFunction } from "express";
import bodyParser from 'body-parser';
import { webhookHandler } from '.';

const server = express();

// https://github.com/expressjs/body-parser#bodyparsertextoptions
server.use(bodyParser.text({ defaultCharset: 'utf8', type: 'text/plain' }));
server.use(bodyParser.json({ type: 'application/json' }))

// body contents required for these endpoints (plain text for EDI and json for Cooper/Allied dropship)
server.post("/easypost-webhook", webhookHandler);

server.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (!err) {
    return next();
  }

  console.error(err);
  res.status(500);
  res.send('500: Internal server error');
});

const SERVER_PORT = 80; // use the ngrok port you have running
server.listen(SERVER_PORT, () =>
  console.log(`Function Server running on http://localhost:${SERVER_PORT}`)
);