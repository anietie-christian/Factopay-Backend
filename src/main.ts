import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { FactoPayExceptionFilter } from './modules/shared/infrastructure/filters/factopay-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
