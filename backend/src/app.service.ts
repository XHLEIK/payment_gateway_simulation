import { Injectable } from '@nestjs/common';

// Injectable service used by AppController to produce the greeting text.
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
