// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarService } from '../infrastructure/adapters/stellar.service';
import { StellarWalletRole, StellarNetworkMode } from '../domain/gateways/stellar-gateway.interface';
import { BlockchainErrorCode } from '../domain/errors/blockchain-errors';
import { StellarLogSanitizer } from '../infrastructure/security/stellar-log-sanitizer';
import { WalletLockManager } from '../infrastructure/security/wallet-lock.manager';

// Mock the Stellar SDK
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Keypair: {
      random: () => ({
        publicKey: () => 'GBBD47IF6LWK7P7TZS2ADQDPTO2DMTM26IE6XYVJ65P3ENW6CIH2WCNR',
        secret: () => 'SADQDPTO2DMTM26IE6XYVJ65P3ENW6CIH2WCNRGBBD47IF6LWK7P7TZ',
      }),
      fromSecret: (secret: string) => ({
        publicKey: () => 'GMASTERPUBLICKEY1234567890123456789012345678901234567',
        secret: () => secret,
      }),
      fromPublicKey: (pub: string) => {
        if (pub.length !== 56 || !pub.startsWith('G')) {
          throw new Error('Invalid key');
        }
        return {
          publicKey: () => pub,
        };
      },
    },
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn().mockImplementation((pub) => {
          if (pub === 'GNOTFOUND') {
            return Promise.reject({ response: { status: 404 } });
          }
          return Promise.resolve({
            accountId: () => pub,
            sequenceNumber: () => '100',
            balances: [
              { asset_type: 'native', balance: '100.0000' },
              { asset_code: 'USDC', asset_issuer: 'GISSUER', balance: '500.0000' },
            ],
          });
        }),
        fetchBaseFee: () => Promise.resolve(100),
      })),
    },
  };
});

describe('StellarService', () => {
  let service: StellarService;
  let configService: ConfigService;
  let mockLockManager: any;

  const mockEnv: Record<string, string> = {
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    STELLAR_MIN_XLM_RESERVE: '50',
    STELLAR_USDC_ISSUER_PUBLIC: 'GISSUER',
    STELLAR_MASTER_PUBLIC: 'GMASTER',
    STELLAR_MASTER_SECRET: 'SMASTERSECRET',
    STELLAR_FEE_PUBLIC: 'GFEE',
    STELLAR_FEE_SECRET: 'SFEESECRET',
    STELLAR_LIQUIDITY_PUBLIC: 'GLIQUIDITY',
    STELLAR_LIQUIDITY_SECRET: 'SLIQUIDITYSECRET',
  };

  beforeEach(async () => {
    mockLockManager = {
      acquire: jest.fn().mockResolvedValue(() => Promise.resolve()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              return mockEnv[key] !== undefined ? mockEnv[key] : defaultValue;
            }),
          },
        },
        {
          provide: WalletLockManager,
          useValue: mockLockManager,
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createKeyPair', () => {
    it('should generate a valid keypair pair', () => {
      const pair = service.createKeyPair();
      expect(pair.publicKey).toBe('GBBD47IF6LWK7P7TZS2ADQDPTO2DMTM26IE6XYVJ65P3ENW6CIH2WCNR');
      expect(pair.secretKey).toBe('SADQDPTO2DMTM26IE6XYVJ65P3ENW6CIH2WCNRGBBD47IF6LWK7P7TZ');
    });
  });

  describe('getAccountInfo', () => {
    it('should return balance and sequence information', async () => {
      const info = await service.getAccountInfo('GVALIDPUBLICKEY');
      expect(info.publicKey).toBe('GVALIDPUBLICKEY');
      expect(info.xlmBalance).toBe('100.0000');
      expect(info.usdcBalance).toBe('500.0000');
      expect(info.sequenceNumber).toBe('100');
    });

    it('should throw INVALID_DESTINATION when Horizon returns 404', async () => {
      await expect(service.getAccountInfo('GNOTFOUND')).rejects.toThrow(
        expect.objectContaining({
          code: BlockchainErrorCode.INVALID_DESTINATION,
        }),
      );
    });
  });

  describe('StellarLogSanitizer', () => {
    it('should redact secret key patterns', () => {
      const rawLog = 'Transaction failed for key SMASTERSECRET and SMASTERSECRET';
      const sanitized = StellarLogSanitizer.sanitize(rawLog);
      expect(sanitized).toBe('Transaction failed for key SMASTERSECRET and SMASTERSECRET');
      
      const realSecret = 'SA367JNZU62EF6SD7525GA7P3N4GCA732AQA4Z4544NGA43B766UXJNZ';
      const rawWithRealSecret = `Error processing: ${realSecret}`;
      const sanitizedReal = StellarLogSanitizer.sanitize(rawWithRealSecret);
      expect(sanitizedReal).toBe('Error processing: [REDACTED_STELLAR_SECRET]');
    });

    it('should recursively sanitize objects and errors', () => {
      const realSecret = 'SA367JNZU62EF6SD7525GA7P3N4GCA732AQA4Z4544NGA43B766UXJNZ';
      const err = new Error(`Secret key leaks here: ${realSecret}`);
      const sanitizedErr = StellarLogSanitizer.sanitize(err);
      expect(sanitizedErr.message).toBe('Secret key leaks here: [REDACTED_STELLAR_SECRET]');
    });
  });
});
