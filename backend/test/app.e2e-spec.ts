import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Simple End-to-End integration test for the NestJS core routing system.
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  // Bootstrap the Nest module environment on a mock application port
  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api'); // Match our main server prefix config
    await app.init();
  });

  // Verify that hitting the root URL returns the hello world greeting
  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  // Close server instance after runs to prevent memory leaks or hanging ports
  afterEach(async () => {
    await app.close();
  });
});
