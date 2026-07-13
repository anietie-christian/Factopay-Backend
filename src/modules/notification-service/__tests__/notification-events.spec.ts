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
    try {
      module = await Test.createTestingModule({
        imports: [
          SharedModule,
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            load: [() => ({})], // empty config
          }),
          NotificationModule,
        ],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .compile();
      
      fail('Expected module to throw initialization error due to missing API keys');
    } catch (error) {
      expect(error.message).toMatch(/Twilio configuration is missing|SendGrid configuration is missing/);
      console.log('--- TEST: Successfully failed-closed on missing keys:', error.message);
    }
  });

  it('should fire the adapter successfully when transfer.completed is emitted', async () => {
    module = await Test.createTestingModule({
      imports: [
        SharedModule,
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              TWILIO_ACCOUNT_SID: 'ACdummy_sid_1234567890123456789012',
              TWILIO_AUTH_TOKEN: 'dummy_token',
              TWILIO_FROM_NUMBER: '+1234567890',
              SENDGRID_API_KEY: 'SG.dummy_key',
              SENDGRID_FROM_EMAIL: 'test@factopay.com',
            }),
          ],
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
  });
});
