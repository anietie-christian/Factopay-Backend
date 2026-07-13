import { Test, TestingModule } from '@nestjs/testing';
import { AmlRuleEngineService } from '../application/services/aml-rule-engine.service';
import { SlackAlertService } from '../infrastructure/services/slack-alert.service';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

describe('AML Rule Engine Service', () => {
  let amlRuleEngineService: AmlRuleEngineService;
  let slackService: SlackAlertService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mockSlackService = {
      sendAlert: jest.fn().mockResolvedValue(undefined),
    };

    const mockPrismaService = {
      alertRecord: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'alert-mock-uuid',
          ...data,
          createdAt: new Date(),
        })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmlRuleEngineService,
        { provide: SlackAlertService, useValue: mockSlackService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    amlRuleEngineService = module.get<AmlRuleEngineService>(AmlRuleEngineService);
    slackService = module.get<SlackAlertService>(SlackAlertService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create an AlertRecord and call Slack for transfers >= 2000', async () => {
    const payload = {
      id: 'tx-12345',
      amount: '2050.00',
      currency: 'EUR',
    };

    await amlRuleEngineService.handleTransferCompleted(payload);

    expect(prisma.alertRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ruleName: 'HIGH_VALUE_TRANSFER',
          severity: 'HIGH',
          targetId: 'tx-12345',
          targetType: 'TRANSFER',
          metadata: { amount: '2050', currency: 'EUR' },
        },
      })
    );
    expect(slackService.sendAlert).toHaveBeenCalledWith(
      '🚨 AML ALERT [HIGH] - Rule: HIGH_VALUE_TRANSFER | Target: TRANSFER (tx-12345)'
    );
  });

  it('should ignore transfers < 2000', async () => {
    const payload = {
      id: 'tx-67890',
      amount: '1999.99',
      currency: 'EUR',
    };

    await amlRuleEngineService.handleTransferCompleted(payload);

    expect(prisma.alertRecord.create).not.toHaveBeenCalled();
    expect(slackService.sendAlert).not.toHaveBeenCalled();
  });

  it('should always alert on ledger reversal', async () => {
    const payload = {
      transactionId: 'rev-001',
      reason: 'Fraud detected',
    };

    await amlRuleEngineService.handleLedgerReversal(payload);

    expect(prisma.alertRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ruleName: 'LEDGER_REVERSAL_TRIGGERED',
          severity: 'CRITICAL',
          targetId: 'rev-001',
          targetType: 'TRANSACTION',
          metadata: payload,
        },
      })
    );
    expect(slackService.sendAlert).toHaveBeenCalledWith(
      '🚨 AML ALERT [CRITICAL] - Rule: LEDGER_REVERSAL_TRIGGERED | Target: TRANSACTION (rev-001)'
    );
  });
});
