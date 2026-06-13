import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// Basic app root controller. Usually just handles uptime checks or basic greeting endpoints.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Root GET endpoint, handy for verifying that the NestJS server is online and responding.
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
