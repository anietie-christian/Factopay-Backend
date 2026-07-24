// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { secretsLoader } from '../secrets.loader';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

jest.mock('@aws-sdk/client-secrets-manager', () => {
  const mClient = {
    send: jest.fn(),
  };
  return {
    SecretsManagerClient: jest.fn(() => mClient),
    GetSecretValueCommand: jest.fn((args) => args),
  };
});

describe('secretsLoader', () => {
  let mockClientInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientInstance = new SecretsManagerClient({} as any);
    delete process.env.AWS_SECRETS_MANAGER_NAME;
    delete process.env.TEST_DB_PASSWORD;
  });

  it('should return empty object if AWS_SECRETS_MANAGER_NAME is not set', async () => {
    const result = await secretsLoader();
    expect(result).toEqual({});
    expect(mockClientInstance.send).not.toHaveBeenCalled();
  });

  it('should load secrets and merge into process.env if AWS_SECRETS_MANAGER_NAME is set', async () => {
    process.env.AWS_SECRETS_MANAGER_NAME = 'factopay-secrets';
    mockClientInstance.send.mockResolvedValueOnce({
      SecretString: JSON.stringify({
        TEST_DB_PASSWORD: 'super-secure-pass',
        JWT_SECRET: 'loaded-from-aws',
      }),
    });

    const result = await secretsLoader();

    expect(result).toEqual({
      TEST_DB_PASSWORD: 'super-secure-pass',
      JWT_SECRET: 'loaded-from-aws',
    });
    expect(process.env.TEST_DB_PASSWORD).toBe('super-secure-pass');
    expect(process.env.JWT_SECRET).toBe('loaded-from-aws');
  });

  it('should log warning and return empty object if AWS call fails', async () => {
    process.env.AWS_SECRETS_MANAGER_NAME = 'factopay-secrets';
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockClientInstance.send.mockRejectedValueOnce(new Error('AWS connection error'));

    const result = await secretsLoader();

    expect(result).toEqual({});
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load secrets from AWS: AWS connection error'),
    );
    consoleWarnSpy.mockRestore();
  });
});
