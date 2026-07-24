// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { validateRequiredEnvironment } from './required-env';

export const secretsLoader = async (): Promise<Record<string, any>> => {
  const secretName = process.env.AWS_SECRETS_MANAGER_NAME;
  const region = process.env.AWS_REGION || 'us-east-1';
  let loadedSecrets: Record<string, any> = {};

  if (!secretName) {
    validateRequiredEnvironment();
    return {};
  }

  try {
    const client = new SecretsManagerClient({ region });
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      }),
    );

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      for (const [key, value] of Object.entries(secrets)) {
        process.env[key] = value as string;
      }
      loadedSecrets = secrets;
    }
  } catch (error: any) {
    console.warn(
      `[SecretsManager] Failed to load secrets from AWS: ${error.message}. Falling back to environment variables.`,
    );
  }

  validateRequiredEnvironment();
  return loadedSecrets;
};
