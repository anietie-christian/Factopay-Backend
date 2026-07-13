import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions } from '@nestjs/throttler';
import { ThrottlerGenerateKeyFunction, ThrottlerGetTrackerFunction } from '@nestjs/throttler/dist/throttler-module-options.interface';

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Throttle by API key hash instead of IP address if present
    if (req?.user?.gatewayApiKey?.keyHash) {
      return req.user.gatewayApiKey.keyHash;
    }
    // Fallback to default (usually IP)
    return req.ips?.length ? req.ips[0] : req.ip;
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    const { req } = this.getRequestResponse(context);

    // Use dynamic limit based on gatewayApiKey.rateLimitTier
    let dynamicLimit = limit;
    if (req?.user?.gatewayApiKey?.rateLimitTier) {
      dynamicLimit = req.user.gatewayApiKey.rateLimitTier;
    }

    return super.handleRequest(
      context,
      dynamicLimit,
      ttl,
      throttler,
      getTracker,
      generateKey
    );
  }
}
