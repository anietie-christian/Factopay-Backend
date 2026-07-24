// ---------------------------------------------------------------------------------------------------------------#*eddiere
import * as crypto from 'crypto';

export class WalletCrypt {
  private static readonly ALGORITHM = 'aes-256-gcm';

  /**
   * Derives a stable 32-byte (256-bit) key from a passphrase using SHA-256.
   */
  private static deriveKey(passphrase: string): Buffer {
    return crypto.createHash('sha256').update(passphrase).digest();
  }

  /**
   * Encrypts a string using AES-256-GCM.
   * Returns a format of `iv:encrypted:tag`.
   */
  public static encrypt(text: string, passphrase: string): string {
    if (!passphrase) {
      throw new Error('Encryption passphrase must not be empty');
    }
    
    const key = this.deriveKey(passphrase);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${encrypted}:${tag}`;
  }

  /**
   * Decrypts an AES-256-GCM encrypted string.
   */
  public static decrypt(cipherText: string, passphrase: string): string {
    if (!passphrase) {
      throw new Error('Decryption passphrase must not be empty');
    }

    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid cipherText format. Expected iv:encryptedText:tag');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const key = this.deriveKey(passphrase);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
