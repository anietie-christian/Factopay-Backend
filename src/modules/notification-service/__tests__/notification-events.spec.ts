import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from '../notification.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { SMS_GATEWAY_TOKEN } from '../domain/gateways/sms-gateway.interface';
import { EMAIL_GATEWAY_TOKEN } from '../domain/gateways/email-gateway.interface';
import { SharedModule } from '../../shared/shared.module';

describe('Notification Service (Integration)', () => {
  let module: TestingModule;
  let eventEmitter: EventEmitter2;

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should fail-closed if API keys are missing', async () => {
    const configKeys = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_FROM_NUMBER',
      'SENDGRID_API_KEY',
      'SENDGRID_FROM_EMAIL',
    ];
    const previousConfig = Object.fromEntries(
      configKeys.map((key) => [key, process.env[key]]),
    );
    configKeys.forEach((key) => delete process.env[key]);

    try {
      const builder = Test.createTestingModule({
        imports: [
          SharedModule,
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            ignoreEnvVars: true,
            load: [() => ({})], // empty config
          }),
          NotificationModule,
        ],
      })
        .overrideProvider(PrismaService)
        .useValue({});

      await expect(builder.compile()).rejects.toThrow(
        /Twilio configuration is missing|SendGrid configuration is missing/,
      );
    } finally {
      for (const [key, value] of Object.entries(previousConfig)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it('should fire the adapter successfully when transfer.completed is emitted', async () => {
    const config = {
      TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'dummy_token',
      TWILIO_FROM_NUMBER: '+1234567890',
      SENDGRID_API_KEY: 'SG.dummy_key',
      SENDGRID_FROM_EMAIL: 'test@factopay.com',
    };
    const previousConfig = Object.fromEntries(
      Object.keys(config).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, config);

    try {
      module = await Test.createTestingModule({
        imports: [
          SharedModule,
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            load: [() => config],
          }),
          EventEmitterModule.forRoot(),
          NotificationModule,
        ],
      })
        .overrideProvider(PrismaService)
        .useValue({
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'user-123',
              email: 'user@example.com',
              phoneNumber: '+0987654321',
              profile: {
                firstName: 'Alice',
              }
            }),
          },
        })
        .compile();

      await module.init();

      const smsGateway = module.get(SMS_GATEWAY_TOKEN);
      const emailGateway = module.get(EMAIL_GATEWAY_TOKEN);
      eventEmitter = module.get(EventEmitter2);

      // Spy on the actual adapter methods to ensure they are called
      const smsSpy = jest.spyOn(smsGateway, 'sendSms').mockImplementation(async () => true);
      const emailSpy = jest.spyOn(emailGateway, 'sendEmail').mockImplementation(async () => true);

      console.log('--- TEST: Emitting transfer.completed...');
      await eventEmitter.emitAsync('transfer.completed', {
        transferId: 'tx-123',
        userId: 'user-123',
        amount: '100',
        currency: 'EUR',
        recipientId: 'rec-456',
      });

      expect(smsSpy).toHaveBeenCalledWith(
        '+0987654321',
        'Hi Alice, your transfer of 100 EUR to rec-456 has successfully completed. Transfer ID: tx-123',
      );
      expect(emailSpy).toHaveBeenCalledWith(
        'user@example.com',
        'Your FactoPay Transfer has successfully completed',
        'Hi Alice, your transfer of 100 EUR to rec-456 has successfully completed. Transfer ID: tx-123',
      );

      console.log('--- TEST: Twilio Adapter was called successfully');
      console.log('--- TEST: SendGrid Adapter was called successfully');
    } finally {
      for (const [key, value] of Object.entries(previousConfig)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
