import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { FactoPayExceptionFilter } from './modules/shared/infrastructure/filters/factopay-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // HTTP security headers using Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled to allow Swagger UI resources to load correctly
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Strict CORS Configuration
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'https://app.factopay.com',
        'http://localhost:3000',
        'http://localhost:4000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:4000',
      ];
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global routing prefix
  app.setGlobalPrefix('api/v1');

  // Swagger API Documentation Config
  const config = new DocumentBuilder()
    .setTitle('FactoPay API')
    .setDescription('FactoPay Backend Core API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new FactoPayExceptionFilter());

  await app.listen(3000);
}
bootstrap();
