import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { SlackAlertService } from '../../infrastructure/services/slack-alert.service';
import { Decimal } from 'decimal.js';

@Injectable()
export class AmlRuleEngineService {
  private readonly logger = new Logger(AmlRuleEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slackService: SlackAlertService,
  ) {}

  @OnEvent('transfer.completed')
  async handleTransferCompleted(payload: any) {
    if (!payload.amount || !payload.id) return;
    
    // Rule: High-value transfer threshold (e.g. over 2,000)
    const amount = new Decimal(payload.amount);
    if (amount.gte(2000)) {
      await this.createAlert(
        'HIGH_VALUE_TRANSFER',
        'HIGH',
        payload.id,
        'TRANSFER',
        { amount: amount.toString(), currency: payload.currency }
      );
    }
  }

  @OnEvent('ledger.reversal')
  async handleLedgerReversal(payload: any) {
    // Always-alert rule for reversals
    await this.createAlert(
      'LEDGER_REVERSAL_TRIGGERED',
      'CRITICAL',
      payload.transactionId,
      'TRANSACTION',
      payload
    );
  }

  @OnEvent('kyc.override')
  async handleKycOverride(payload: any) {
    // Always-alert rule for KYC overrides
    await this.createAlert(
      'KYC_MANUAL_OVERRIDE',
      'CRITICAL',
      payload.userId,
      'USER',
      payload
    );
  }

  @OnEvent('wallet.floor_breach')
  async handleFloorBreach(payload: any) {
    // Always-alert rule for System Wallet floor breaches
    await this.createAlert(
      'SYSTEM_WALLET_FLOOR_BREACH',
      'CRITICAL',
      payload.walletId,
      'WALLET',
      payload
    );
  }

  private async createAlert(ruleName: string, severity: string, targetId: string, targetType: string, metadata: any) {
    try {
      const alert = await this.prisma.alertRecord.create({
        data: {
          ruleName,
          severity,
          targetId,
          targetType,
          metadata,
        }
      });

      const message = `🚨 AML ALERT [${severity}] - Rule: ${ruleName} | Target: ${targetType} (${targetId})`;
      await this.slackService.sendAlert(message);
      this.logger.log(`Created AML Alert: ${alert.id}`);
    } catch (e) {
      this.logger.error('Failed to create AML alert', e instanceof Error ? e.stack : e);
    }
  }
}
