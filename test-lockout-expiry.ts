import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { VerifyOtpUseCase } from './src/modules/auth-identity/application/use-cases/verify-otp.use-case';
import { PrismaService } from './src/modules/shared/infrastructure/database/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const verifyOtpUseCase = app.get(VerifyOtpUseCase);
  const prisma = app.get(PrismaService);

  // Setup user
  const email = 'test.lockout@example.com';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, phoneNumber: '+10987654321', passwordHash: 'dummy', isActive: true, kycTier: 'NONE' }
    });
  }

  // --- TEST LOCKOUT ---
  console.log('\n--- TEST: ATTEMPT LOCKOUT ---');
  const lockoutCode = crypto.randomInt(100000, 999999).toString();
  const lockoutHash = await bcrypt.hash(lockoutCode, 10);
  
  await prisma.otpCode.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      codeHash: lockoutHash,
      type: 'EMAIL',
      attempts: 4, // 4 failed attempts so far
      maxAttempts: 5,
      isUsed: false,
      expiresAt: new Date(Date.now() + 15 * 60000), // 15 mins in future
    }
  });

  console.log(`1. Using code, attempting 5th failure...`);
  try {
    await verifyOtpUseCase.execute({ userId: user.id, code: '000000', type: 'EMAIL' });
  } catch (e) {
    console.log(`[Result] ${e.message}`);
  }

  console.log(`2. Attempting 6th try with the CORRECT code (should be locked out)...`);
  try {
    await verifyOtpUseCase.execute({ userId: user.id, code: lockoutCode, type: 'EMAIL' });
    console.log(`[Result] FAILED: It succeeded but should have been locked out!`);
  } catch (e) {
    console.log(`[Result] ${e.message}`);
  }

  // --- TEST EXPIRY ---
  console.log('\n--- TEST: EXPIRY ---');
  const expiryCode = crypto.randomInt(100000, 999999).toString();
  const expiryHash = await bcrypt.hash(expiryCode, 10);

  await prisma.otpCode.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      codeHash: expiryHash,
      type: 'EMAIL',
      attempts: 0,
      maxAttempts: 5,
      isUsed: false,
      expiresAt: new Date(Date.now() - 60000), // 1 minute in the past
    }
  });

  console.log(`1. Attempting to use expired correct code...`);
  try {
    await verifyOtpUseCase.execute({ userId: user.id, code: expiryCode, type: 'EMAIL' });
    console.log(`[Result] FAILED: It succeeded but should have been expired!`);
  } catch (e) {
    console.log(`[Result] ${e.message}`);
  }

  await app.close();
}

bootstrap().catch(console.error);
