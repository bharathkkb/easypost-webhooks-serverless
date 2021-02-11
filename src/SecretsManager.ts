import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const PROJECT_ID_AS_NUMBER = 12345678; // this is a numeric identifier for your GCP project.  You can get it from gcloud info

export const getLatestSecret = async (secretName: string): Promise<string> => {
    const client = new SecretManagerServiceClient();

    // https://cloud.google.com/secret-manager/docs/access-control (versions access required)
    const [version] = await client.accessSecretVersion({
        name: `projects/${PROJECT_ID_AS_NUMBER}/secrets/${secretName}/versions/latest`
    });
    return (version?.payload?.data as any /* it's an ArrayBuffer */).toString('utf8');
}