import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { winstonLoggerOptions } from './common/logger';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  // 1. Initialize the Nest application using Winston as our custom log manager
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonLoggerOptions),
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3001);

  // 2. Set a global prefix so all endpoints begin with '/api' (e.g. /api/auth/login)
  app.setGlobalPrefix('api');

  // 3. Enable CORS for cross-origin communications between the Next.js frontend and NestJS backend
  app.enableCors({
    origin: true, // Allow all origins for dev/testing ease. In production, restrict this.
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 4. Set up a global pipe to automatically parse and validate request DTOs using class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips away properties that are not explicitly defined in the DTO schema
      transform: true, // Autoconverts incoming string query/body params to their matched class types
      forbidNonWhitelisted: true, // Throw an error if a client sends extra fields not declared in DTO
    }),
  );

  // 5. Intercept every incoming request to log its path, execution latency, and completion status
  app.useGlobalInterceptors(new LoggingInterceptor());

  console.log(`Starting NestJS application on port ${port}...`);
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
}

// Fire up the server
bootstrap();
