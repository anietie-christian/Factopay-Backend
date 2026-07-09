import { Injectable, BadRequestException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface SocialProfile {
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class SocialAuthService {
  private readonly googleClient: OAuth2Client;
  private readonly appleJwksClient = jwksClient({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
    rateLimit: true,
  });

  constructor(private readonly configService: ConfigService) {
    this.googleClient = new OAuth2Client();
  }
  /**
   * Verifies the social token and returns user profile details.
   */
  async verifyToken(provider: 'GOOGLE' | 'APPLE', token: string): Promise<SocialProfile> {
    if (provider === 'GOOGLE') {
      return this.verifyGoogleToken(token);
    } else if (provider === 'APPLE') {
      return this.verifyAppleToken(token);
    }
    throw new BadRequestException('Unsupported social provider');
  }

  private async verifyGoogleToken(token: string): Promise<SocialProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new BadRequestException('Invalid Google token payload');
      }

      return {
        providerId: payload.sub,
        email: payload.email.toLowerCase(),
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
      };
    } catch (error) {
      throw new BadRequestException(`Google token verification failed: ${error.message}`);
    }
  }

  private async verifyAppleToken(token: string): Promise<SocialProfile> {
    try {
      const decoded = jwt.decode(token, { complete: true }) as any;
      if (!decoded || !decoded.header || !decoded.header.kid) {
        throw new BadRequestException('Invalid Apple token format');
      }

      const kid = decoded.header.kid;
      const key = await this.appleJwksClient.getSigningKey(kid);
      const signingKey = key.getPublicKey();

      const payload = jwt.verify(token, signingKey, {
        issuer: 'https://appleid.apple.com',
        audience: this.configService.get<string>('APPLE_CLIENT_ID'),
      }) as any;

      if (!payload || !payload.email) {
        throw new BadRequestException('Invalid Apple token payload');
      }

      // Apple does not always send name in ID token on subsequent logins; client should pass it if required.
      return {
        providerId: payload.sub,
        email: payload.email.toLowerCase(),
        firstName: payload.firstName || '', // Apple sends name in request body during initial authentication
        lastName: payload.lastName || '',
      };
    } catch (error) {
      throw new BadRequestException(`Apple token verification failed: ${error.message}`);
    }
  }
}
