export class StellarLogSanitizer {
  private static readonly SECRET_KEY_REGEX = /S[A-Z2-7]{55}/g;

  /**
   * Sanitizes a string or object, replacing any Stellar secret keys with a redirection placeholder.
   */
  public static sanitize(input: any): any {
    if (!input) {
      return input;
    }

    if (typeof input === 'string') {
      return input.replace(this.SECRET_KEY_REGEX, '[REDACTED_STELLAR_SECRET]');
    }

    if (input instanceof Error) {
      const sanitizedError = new Error(this.sanitize(input.message));
      sanitizedError.name = input.name;
      if (input.stack) {
        sanitizedError.stack = this.sanitize(input.stack);
      }
      // Copy extra properties (like Stellar SDK's response details) if present
      const extra = input as any;
      for (const key of Object.keys(extra)) {
        if (key !== 'message' && key !== 'stack') {
          (sanitizedError as any)[key] = this.sanitizeDeep(extra[key]);
        }
      }
      return sanitizedError;
    }

    if (typeof input === 'object') {
      return this.sanitizeDeep(input);
    }

    return input;
  }

  private static sanitizeDeep(obj: any): any {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      return this.sanitize(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeDeep(item));
    }
    if (typeof obj === 'object') {
      const copy: any = {};
      for (const [key, value] of Object.entries(obj)) {
        copy[key] = this.sanitizeDeep(value);
      }
      return copy;
    }
    return obj;
  }
}
