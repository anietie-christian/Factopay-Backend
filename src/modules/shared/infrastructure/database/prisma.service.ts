import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  /**
   * A separate PrismaClient instance that connects directly to Postgres,
   * bypassing pgbouncer. Used exclusively for interactive transactions
   * ($transaction with a callback) where SELECT ... FOR UPDATE locks
   * require a single, persistent backend connection.
   */
  private directClient: PrismaClient;

  constructor(private readonly configService: ConfigService) {
    const pooledUrl = configService.get<string>('DATABASE_URL') || '';

    // Item 6: Validate ?pgbouncer=true is present on pooled connection string
    if (pooledUrl && !pooledUrl.includes('pgbouncer=true')) {
      // Log a warning — missing pgbouncer=true causes DEALLOCATE ALL round trips
      // that add latency on every prepared statement
      new Logger(PrismaService.name).warn(
        'DATABASE_URL is missing ?pgbouncer=true — this will cause unnecessary DEALLOCATE ALL round trips',
      );
    }

    // Main client uses DATABASE_URL (pgbouncer pooled) for normal CRUD
    super({
      datasources: {
        db: {
          url: pooledUrl,
        },
      },
      log: [{ emit: 'event', level: 'query' }],
    });

    // Direct client uses DIRECT_URL (unpooled) for interactive transactions
    // Item 5: Explicit connection_limit — interactive transactions are serialized
    // by advisory locks, but we need enough direct connections to handle peak 
    // concurrent transfers without artificial client-side queuing.
    const directUrl = configService.get<string>('DIRECT_URL') || '';
    const directConnectionLimit = configService.get<number>('DIRECT_CONNECTION_LIMIT', 20);
    const directUrlWithLimit = directUrl
      ? this.appendConnectionLimit(directUrl, directConnectionLimit)
      : pooledUrl;

    this.logger.debug(`DIRECT_URL is ${directUrl ? 'SET' : 'UNDEFINED'} (connection_limit=${directConnectionLimit})`);
    this.directClient = new PrismaClient({
      datasources: {
        db: {
          url: directUrlWithLimit,
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
      this.logger.debug(`[Main DB] Query took ${e.duration}ms: ${e.query.substring(0, 100)}...`);
    });

    // @ts-ignore
    this.directClient.$on('query', (e: any) => {
      this.logger.debug(`[Direct DB] Query took ${e.duration}ms: ${e.query.substring(0, 100)}...`);
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

  /**
   * Appends connection_limit to a Prisma connection URL if not already present.
   */
  private appendConnectionLimit(url: string, limit: number): string {
    if (url.includes('connection_limit=')) {
      return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}connection_limit=${limit}`;
  }
}