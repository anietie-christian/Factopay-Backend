// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { SubmitSettlementUseCase } from '../../../blockchain-settlement/application/use-cases/submit-settlement.use-case';
import { AdminAuditService } from '../../../shared/infrastructure/services/admin-audit.service';

@Injectable()
export class AdminReviewTransferUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly submitSettlementUseCase: SubmitSettlementUseCase,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async execute(params: {
    transferId: string;
    adminId: string;
    decision: 'APPROVED' | 'REJECTED';
    notes?: string;
    ipAddress: string;
  }) {
    const { transferId, adminId, decision, notes, ipAddress } = params;

    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer ${transferId} not found.`);
    }

    if (transfer.adminReviewStatus) {
      throw new BadRequestException(`Transfer ${transferId} has already been reviewed.`);
    }

    const updatedTransfer = await this.prisma.transfer.update({
      where: { id: transferId },
      data: {
        adminReviewStatus: decision,
        adminReviewerId: adminId,
        adminNotes: notes || '',
      },
    });

    // Log admin audit event
    await this.adminAuditService.log(
      adminId,
      decision === 'APPROVED' ? 'TRANSFER_REVIEW_APPROVED' : 'TRANSFER_REVIEW_REJECTED',
      'TRANSFER',
      transferId,
      { notes, decision },
      ipAddress,
    );

    if (decision === 'APPROVED') {
      const recipientWallet = await this.prisma.stellarWallet.findUnique({
        where: { userId: transfer.recipientId || '' },
      });

      if (!recipientWallet) {
        throw new BadRequestException('Recipient does not have a provisioned Stellar wallet.');
      }

      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'BLOCKCHAIN_PENDING' },
      });
      await this.prisma.transferEvent.create({
        data: { transferId: transferId, status: 'BLOCKCHAIN_PENDING', metadata: { message: 'Approved by admin, moving to blockchain settlement' } }
      });

      try {
        await this.submitSettlementUseCase.execute({
          transferId: transfer.id,
          destinationPublicKey: recipientWallet.publicKey,
          amount: transfer.amount.toString(),
          memo: `FW-${transfer.id.slice(0, 8)}`,
          adminId,
          ipAddress,
        });
      } catch (error) {
        // If settlement submission throws, transfer stays PENDING/FAILED, let controller propagate it
        throw new BadRequestException(`Settlement submission failed during review approval: ${error.message}`);
      }
    } else {
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: {
          status: 'FAILED',
          failureReason: 'Rejected by admin review.',
        },
      });
      await this.prisma.transferEvent.create({
        data: { transferId: transferId, status: 'FAILED', metadata: { message: 'Rejected by admin review' } }
      });
    }

    return updatedTransfer;
  }
}
