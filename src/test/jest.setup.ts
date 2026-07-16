process.env.JWT_SECRET ||= 'test-jwt-secret-32-characters-minimum';
process.env.PII_ENCRYPTION_KEY ||= 'test-pii-encryption-key-32-characters';
process.env.PII_BLIND_INDEX_SALT ||= 'test-pii-blind-index-salt';
process.env.SESSION_BINDING_SALT ||= 'test-session-binding-salt';
process.env.TOTP_ENCRYPTION_KEY ||= 'test-totp-encryption-key-32-characters';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'test-payment-webhook-secret';
process.env.TRANSAK_WEBHOOK_SECRET ||= 'transak_test_secret';
process.env.SUMSUB_WEBHOOK_SECRET ||= 'test-sumsub-webhook-secret';
process.env.TWILIO_ACCOUNT_SID ||= 'AC00000000000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN ||= 'test-twilio-auth-token';
process.env.TWILIO_FROM_NUMBER ||= '+15550000000';
process.env.SENDGRID_API_KEY ||= 'SG.test-key';
process.env.SENDGRID_FROM_EMAIL ||= 'no-reply@test.factopay.com';
process.env.STELLAR_WALLET_ENCRYPTION_KEY ||= 'test-stellar-wallet-encryption-key-32-characters';

import * as cryptoModule from 'crypto';
if (!global.crypto) {
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: () => cryptoModule.randomUUID(),
    },
    writable: true,
    configurable: true,
  });
}

