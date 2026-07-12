import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * A separate PrismaClient instance that connects directly to Postgres,
   * bypassing pgbouncer. Used exclusively for interactive transactions
   * ($transaction with a callback) where SELECT ... FOR UPDATE locks
   * require a single, persistent backend connection.
   */
  private directClient: PrismaClient;

  constructor(private readonly configService: ConfigService) {
    // Main client uses DATABASE_URL (pgbouncer pooled) for normal CRUD
    super({
      datasources: {
        db: {
          url: configService.get<string>('DATABASE_URL'),
        },
      },
      log: [{ emit: 'event', level: 'query' }],
    });

    // Direct client uses DIRECT_URL (unpooled) for interactive transactions
    const directUrl = configService.get<string>('DIRECT_URL');
    console.log('PRISMA SERVICE: DIRECT_URL is', directUrl ? 'SET' : 'UNDEFINED');
    this.directClient = new PrismaClient({
      datasources: {
        db: {
          url: directUrl || configService.get<string>('DATABASE_URL'),
        },
      },
      log: [{ emit: 'event', level: 'query' }],
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.directClient.$connect();

    // @ts-ignore
    this.$on('query', (e: any) => {
      console.log(`[Main DB] Query took ${e.duration}ms: ${e.query.substring(0, 100)}...`);
    });

    // @ts-ignore
    this.directClient.$on('query', (e: any) => {
      console.log(`[Direct DB] Query took ${e.duration}ms: ${e.query.substring(0, 100)}...`);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.directClient.$disconnect();
  }

  /**
   * Use this for interactive transactions that need row-level locks.
   * Routes through the direct (non-pgbouncer) connection.
   */
  $transactionDirect<T>(
    fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.directClient.$transaction(fn, options);
  }
}