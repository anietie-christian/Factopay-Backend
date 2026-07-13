import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { ISmsGateway, SMS_GATEWAY_TOKEN } from '../../domain/gateways/sms-gateway.interface';
import { IEmailGateway, EMAIL_GATEWAY_TOKEN } from '../../domain/gateways/email-gateway.interface';

export interface TransferEventPayload {
  transferId: string;
  userId: string;
  amount: string;
  currency: string;
  recipientId: string;
}

@Injectable()
export class TransferEventListener {
  private readonly logger = new Logger(TransferEventListener.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_GATEWAY_TOKEN) private readonly smsGateway: ISmsGateway,
    @Inject(EMAIL_GATEWAY_TOKEN) private readonly emailGateway: IEmailGateway,
  ) {}

  @OnEvent('transfer.completed')
  async handleTransferCompleted(payload: TransferEventPayload) {
    this.logger.log(`Received transfer.completed event for transfer: ${payload.transferId}`);
    await this.notifyUser(payload, 'COMPLETED');
  }

  @OnEvent('transfer.failed')
  async handleTransferFailed(payload: TransferEventPayload) {
    this.logger.log(`Received transfer.failed event for transfer: ${payload.transferId}`);
    await this.notifyUser(payload, 'FAILED');
  }

  private async notifyUser(payload: TransferEventPayload, status: 'COMPLETED' | 'FAILED') {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true, phoneNumber: true, profile: { select: { firstName: true } } }
      });

      if (!user) {
        this.logger.warn(`Could not find user ${payload.userId} for notification.`);
        return;
      }

      const statusText = status === 'COMPLETED' ? 'successfully completed' : 'failed';
      const subject = `Your FactoPay Transfer has ${statusText}`;
      const firstName = user.profile?.firstName || 'Customer';
      const message = `Hi ${firstName}, your transfer of ${payload.amount} ${payload.currency} to ${payload.recipientId} has ${statusText}. Transfer ID: ${payload.transferId}`;

      const notifyPromises: Promise<any>[] = [];

      if (user.phoneNumber) {
        // Suppress errors to avoid crashing the event loop, just log them
        notifyPromises.push(this.smsGateway.sendSms(user.phoneNumber, message).catch(e => {
          this.logger.error(`Failed to send SMS notification for transfer ${payload.transferId}`, e);
        }));
      }

      if (user.email) {
        notifyPromises.push(this.emailGateway.sendEmail(user.email, subject, message).catch(e => {
          this.logger.error(`Failed to send Email notification for transfer ${payload.transferId}`, e);
        }));
      }

      await Promise.all(notifyPromises);
      this.logger.log(`Dispatch complete for transfer ${payload.transferId}`);
    } catch (error) {
      this.logger.error(`Failed to process notification for transfer ${payload.transferId}`, error);
    }
  }
}
