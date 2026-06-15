import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { winstonLoggerOptions } from './common/logger';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  // 1. Initialize the Nest application using Winston as our custom log manager
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonLoggerOptions),
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3001);

  // 2. Set a global prefix so all endpoints begin with '/api' (e.g. /api/auth/login)
  app.setGlobalPrefix('api');

  // Register cookie-parser middleware for cookie sessions
  app.use(cookieParser());

  // Register Helmet middleware with strict production-grade security headers & CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
          frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
          connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // Turn off for Cloudflare asset loading compatibility
      xFrameOptions: { action: 'sameorigin' },
      referrerPolicy: { policy: 'same-origin' },
    })
  );

  // Add standard OWASP headers manually if not handled by default Helmet configuration
  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    next();
  });

  // 3. Enable CORS for cross-origin communications between the Next.js frontend and NestJS backend
  const isProduction = configService.get<string>('env') === 'production';
  const frontendUrl = configService.get<string>('FRONTEND_URL') || process.env.FRONTEND_URL || 'http://localhost:3000';

  app.enableCors({
    origin: isProduction ? frontendUrl : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // Required to allow cookies to be sent back and forth
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
