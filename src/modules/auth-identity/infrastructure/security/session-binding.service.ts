import * as crypto from 'crypto';

export class SessionBindingService {
  private static getSalt(): string {
    return process.env.SESSION_BINDING_SALT || 'session-binding-salt-default-key!';
  }

  public static getSubnet(ip: string | undefined): string {
    if (!ip) return 'unknown-ip';

    let cleanIp = ip.trim();
    if (cleanIp === '::1') {
      return '127.0.0.0/24';
    }
    if (cleanIp.startsWith('::ffff:')) {
      cleanIp = cleanIp.substring(7);
    }

    if (cleanIp.includes('.')) {
      const parts = cleanIp.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      }
      return cleanIp;
    }

    if (cleanIp.includes(':')) {
      const parts = cleanIp.split(':');
      if (parts.length >= 3) {
        return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
      }
      return cleanIp;
    }

    return cleanIp;
  }

  public static generateFingerprint(ip: string | undefined, userAgent: string | undefined): string {
    const subnet = this.getSubnet(ip);
    const ua = userAgent || 'unknown-ua';
    const salt = this.getSalt();
    return crypto
      .createHmac('sha256', salt)
      .update(`${ua}|${subnet}`)
      .digest('hex');
  }
}
