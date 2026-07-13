export const SMS_GATEWAY_TOKEN = 'SMS_GATEWAY_TOKEN';

export interface ISmsGateway {
  sendSms(to: string, message: string): Promise<boolean>;
}
