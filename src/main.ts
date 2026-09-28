import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();
  app.useStaticAssets(join(process.cwd(), 'public'));

  // Global validation pipe: strips unknown properties, transforms payloads
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Socket.IO adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global exception filter: normalises all errors to { error: { code, message } }
  app.useGlobalFilters(new AllExceptionsFilter());

  // OpenAPI / Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Booking API')
    .setDescription(
      'Appointment booking API. Slots are pre-seeded and each slot accepts at most one active booking. ' +
      'Real-time updates are delivered via Socket.IO (see README for details).',
    )
    .setVersion('1.0.0')
    .addTag('Slots', 'Browse available appointment slots')
    .addTag('Bookings', 'Create and cancel bookings')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Serve OpenAPI spec as JSON
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/docs`);
  console.log(`OpenAPI JSON: http://localhost:${port}/openapi.json`);
}

bootstrap();
