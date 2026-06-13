import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  // Load TypeORM repositories for User and Wallet. UsersService creates wallets for new users, so it needs both.
  imports: [TypeOrmModule.forFeature([User, Wallet])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService], // Export UsersService so AuthModule and other modules can use it for verification/lookup
})
export class UsersModule {}
