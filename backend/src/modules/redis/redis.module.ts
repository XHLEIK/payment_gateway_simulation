import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

// Marking it as @Global() makes RedisService accessible across all modules
// (auth, wallets, analytics) without having to import RedisModule in every child module.
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
