import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DestinationAllowlistService {
  private allowedAddresses: Set<string>;

  constructor(private readonly configService: ConfigService) {
    this.loadAllowlist();
  }

  /**
   * Refreshes the allowlist from configuration/environment.
   */
  public loadAllowlist(): void {
    const rawDestinations = this.configService.get<string>('STELLAR_ALLOWED_DESTINATIONS', '');
    const addresses = rawDestinations
      .split(',')
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0);
    
    this.allowedAddresses = new Set(addresses);
  }

  /**
   * Checks if the destination Stellar public key is in the allowlist.
   */
  public isAllowed(publicKey: string): boolean {
    return this.allowedAddresses.has(publicKey);
  }

  /**
   * Returns all allowed addresses.
   */
  public getAllowedAddresses(): string[] {
    return Array.from(this.allowedAddresses);
  }
}
