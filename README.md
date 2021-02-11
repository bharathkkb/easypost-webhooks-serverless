# easypost-webhooks-serverless

Used to recieve and process webhooks

Currently supports Easypost tracking updates.

To test locally use a service such as ngrok.  Example configuration:
```yaml
authtoken: <auth-to-get-secret>
tunnels:
  # ngrok http -region=us -hostname=your-side.ngrok.io 80
  your-site:
    # ngrok start -config=ngrok.yml your-site
    proto: http
    hostname: your-name.ngrok.io
    addr: 127.0.0.1:80
```

Create a webhook service on Easypost with this endpoint:
`https://username:p4ssw0rd@your-name.ngrok.io/easypost-webhook`

The basic auth is a simple verification, but somebody would need to know that as well as the GCP function endpoint to forge requests.  Easypost doesn't support certificates or message signing to verify authenticity.

Now the requests will be incoming to your server that you can run.  Running in the debugger with real-time requests arriving will cause re-entry.

You can review the incoming requests as well in the ngrok local server typically `http://localhost:4040`:
```bash
Session Status                online
Account                       <**redacted**>
Version                       2.3.35
Region                        United States (us)
Web Interface                 http://127.0.0.1:4040
Forwarding                    http://your-name.ngrok.io -> http://127.0.0.1:80
Forwarding                    https://your-name.ngrok.io -> http://127.0.0.1:80
POST /easypost-webhook        ...
```

A better way to test locally would be by using `curl` to simulate incoming requests.  There is a feature in ngrok to replay, so if you just collect a series of events then you can replay the ones you want.  There is a test as well that can be used to load use-cases from the database and process them using the debugger.

For the database password - you can use google secrets.  The example in this project uses 'your-mysql-production-password' with Google Secrets Manager. Look in DatabaseConnector for other ways.

For the github action in this project, which is used for CI/CD, you need these secrets in github:
```
GCP_PROJECT_ID=your-google-project-id
GCP_SA_KEY=<JSON or base64 of your service account - generated in IAM>
CLOUD_SQL_CONNECTION_NAME=instance-id-gcp-cloud-sql
DB_NAME=db-user-name
DB_USER=db-user
```