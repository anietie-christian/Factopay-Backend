import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from '../../application/services/api-key.service';

@Injectable()
export class GatewayApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    try {
      const apiKeyRecord = await this.apiKeyService.validateApiKey(apiKey);
      // Bind the authenticated userId to the request object
      request.user = { id: apiKeyRecord.userId, sub: apiKeyRecord.userId, gatewayApiKey: apiKeyRecord };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid API Key');
    }
  }
}
