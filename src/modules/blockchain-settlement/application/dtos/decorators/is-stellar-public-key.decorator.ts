import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { Keypair } from '@stellar/stellar-sdk';

export function IsStellarPublicKey(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStellarPublicKey',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: `${propertyName} must be a valid 56-character Stellar public key starting with 'G'`,
        ...validationOptions,
      },
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }
          if (value.length !== 56 || !value.startsWith('G')) {
            return false;
          }
          try {
            Keypair.fromPublicKey(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
