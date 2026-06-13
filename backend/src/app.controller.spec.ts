import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Standard unit testing file for verifying AppController's behavior.
describe('AppController', () => {
  let appController: AppController;

  // Bootstraps a lightweight testing module before running assertions
  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      // Assert that getHello returns the mock value from the service
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
