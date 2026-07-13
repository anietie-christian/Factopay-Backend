import { PiiCrypt } from '../infrastructure/security/pii-crypt';
import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user.repository';
import { User, Role, KycStatus } from '../domain/models/user.model';

describe('PII Encryption & Blind Indexing', () => {
  describe('PiiCrypt Utility', () => {
    const rawPhone = '+1234567890';

    it('should encrypt and decrypt correctly', () => {
      const encrypted = PiiCrypt.encrypt(rawPhone);
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toEqual(rawPhone);
      expect(encrypted?.split(':').length).toBe(3); // iv:ciphertext:tag

      const decrypted = PiiCrypt.decrypt(encrypted);
      expect(decrypted).toEqual(rawPhone);
    });

    it('should generate deterministic blind indexes', () => {
      const index1 = PiiCrypt.generateBlindIndex(rawPhone);
      const index2 = PiiCrypt.generateBlindIndex(rawPhone);
      const index3 = PiiCrypt.generateBlindIndex('+0987654321');

      expect(index1).toEqual(index2);
      expect(index1).not.toEqual(index3);
      expect(index1).toHaveLength(64); // SHA-256 hex string
    });

    it('should fall back gracefully if decrypting unencrypted plaintext', () => {
      const plain = 'unencrypted_plaintext';
      const decrypted = PiiCrypt.decrypt(plain);
      expect(decrypted).toEqual(plain);
    });
  });

  describe('PrismaUserRepository Integration', () => {
    let repository: PrismaUserRepository;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        user: {
          findUnique: jest.fn(),
          upsert: jest.fn(),
        },
      };
      repository = new PrismaUserRepository(mockPrisma);
    });

    it('should encrypt phone number and generate index when saving a user', async () => {
      const user = new User(
        'user-123',
        'test@factopay.com',
        '+15551234567',
        'hash123',
        true,
        true,
        KycStatus.APPROVED,
        'TIER_1',
        Role.USER,
        true,
        null,
        new Date(),
        new Date(),
      );

      mockPrisma.user.upsert.mockResolvedValue({
        id: 'user-123',
        email: 'test@factopay.com',
        phoneNumber: PiiCrypt.encrypt('+15551234567'),
        phoneNumberIndex: PiiCrypt.generateBlindIndex('+15551234567'),
        passwordHash: 'hash123',
        isEmailVerified: true,
        isPhoneVerified: true,
        kycStatus: 'APPROVED',
        kycTier: 'TIER_1',
        role: 'USER',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isMfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      });

      const savedUser = await repository.save(user);

      expect(savedUser.phoneNumber).toEqual('+15551234567');
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            phoneNumber: expect.not.stringContaining('+15551234567'), // should be encrypted
            phoneNumberIndex: PiiCrypt.generateBlindIndex('+15551234567'),
          }),
        }),
      );
    });

    it('should search using blind index in findByPhoneNumber', async () => {
      const phone = '+15559876543';
      const blindIndex = PiiCrypt.generateBlindIndex(phone);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-456',
        email: 'search@factopay.com',
        phoneNumber: PiiCrypt.encrypt(phone),
        phoneNumberIndex: blindIndex,
        passwordHash: 'hash',
        isEmailVerified: true,
        isPhoneVerified: true,
        kycStatus: 'APPROVED',
        kycTier: 'TIER_1',
        role: 'USER',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await repository.findByPhoneNumber(phone);

      expect(result).not.toBeNull();
      expect(result?.id).toEqual('user-456');
      expect(result?.phoneNumber).toEqual(phone);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { phoneNumberIndex: blindIndex },
      });
    });
  });
});
