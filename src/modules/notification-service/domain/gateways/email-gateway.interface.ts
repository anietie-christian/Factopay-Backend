export const EMAIL_GATEWAY_TOKEN = 'EMAIL_GATEWAY_TOKEN';

export interface IEmailGateway {
  sendEmail(to: string, subject: string, body: string): Promise<boolean>;
}
