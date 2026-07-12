import { InvalidUuidException } from '../exceptions/value-object.exception';

export class Uuid {
  private readonly value: string;
  private static readonly UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(value: string) {
    if (!Uuid.isValid(value)) {
      throw new InvalidUuidException(`Invalid UUID v4 format: ${value}`);
    }
    this.value = value.toLowerCase();
  }

  static isValid(value: string): boolean {
    return Uuid.UUID_V4_REGEX.test(value);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Uuid): boolean {
    return this.value === other.getValue();
  }

  toString(): string {
    return this.value;
  }
}
