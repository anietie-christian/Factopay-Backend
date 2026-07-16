export const CORE_REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'PII_ENCRYPTION_KEY',
  'PII_BLIND_INDEX_SALT',
  'SESSION_BINDING_SALT',
  'TOTP_ENCRYPTION_KEY',
  'PAYMENT_WEBHOOK_SECRET',
  'TRANSAK_WEBHOOK_SECRET',
  'SUMSUB_WEBHOOK_SECRET',
] as const;

export const PRODUCTION_REQUIRED_ENV_VARS = [
  ...CORE_REQUIRED_ENV_VARS,
  'DATABASE_URL',
  'DIRECT_URL',
  'ALLOWED_ORIGINS',
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'STELLAR_WALLET_ENCRYPTION_KEY',
  'STELLAR_HORIZON_URL',
  'STELLAR_NETWORK_PASSPHRASE',
  'STELLAR_USDC_ISSUER_PUBLIC',
  'STELLAR_MASTER_PUBLIC',
  'STELLAR_MASTER_SECRET',
  'STELLAR_FEE_PUBLIC',
  'STELLAR_FEE_SECRET',
  'STELLAR_LIQUIDITY_PUBLIC',
  'STELLAR_LIQUIDITY_SECRET',
] as const;

type CoreRequiredEnvVar = (typeof CORE_REQUIRED_ENV_VARS)[number];
type ProductionRequiredEnvVar = (typeof PRODUCTION_REQUIRED_ENV_VARS)[number];
export type RequiredEnvVar = CoreRequiredEnvVar | ProductionRequiredEnvVar;

export type RequiredEnvironment = Record<RequiredEnvVar, string>;

export function getRequiredEnv(name: RequiredEnvVar | string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

export function getRequiredEnvBuffer(name: string): Buffer {
  return Buffer.from(getRequiredEnv(name), 'utf8');
}

export function validateRequiredEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Partial<RequiredEnvironment> {
  const required = source.NODE_ENV === 'production'
    ? PRODUCTION_REQUIRED_ENV_VARS
    : CORE_REQUIRED_ENV_VARS;

  const missing = required.filter((name) => {
    const value = source[name];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const config: Partial<RequiredEnvironment> = {};
  for (const name of required) {
    config[name] = source[name] as string;
  }

  return config;
}
