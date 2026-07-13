import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { JwtService } from '@nestjs/jwt';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Important: set global prefix to match production
  app.setGlobalPrefix('api/v1');
  await app.listen(0);
  const url = await app.getUrl();

  const jwtService = app.get(JwtService);
  const prisma = app.get(require('./src/modules/shared/infrastructure/database/prisma.service').PrismaService);
  
  const payload = { sub: 'dummy-user-id-fx', email: 'test-fx@example.com', role: 'USER' };
  
  // Create user
  await prisma.user.upsert({
    where: { id: payload.sub },
    update: {},
    create: {
      id: payload.sub,
      email: payload.email,
      password_hash: 'dummy',
      first_name: 'FX',
      last_name: 'Test',
      role: 'USER',
      status: 'ACTIVE'
    }
  });

  const token = jwtService.sign(payload);

  console.log('\n--- 1. REQUEST WITHOUT TOKEN ---');
  const res1 = await fetch(`${url}/api/v1/rates/live`);
  console.log(`Status: ${res1.status}`);

  console.log('\n--- 2. REQUEST WITH VALID TOKEN ---');
  const res2 = await fetch(`${url}/api/v1/rates/live`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`Status: ${res2.status}`);
  const data = await res2.json();
  console.log(`Body: ${JSON.stringify(data).substring(0, 100)}...`);

  await app.close();
}

bootstrap().catch(console.error);
