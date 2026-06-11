import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {}

  async create(name: string, email: string, passwordHash: string, role: UserRole = UserRole.USER): Promise<User> {
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const user = this.userRepository.create({
      name,
      email,
      passwordHash,
      role,
    });

    const savedUser = await this.userRepository.save(user);

    // Automatically create a wallet with 0 balance for the new user
    const wallet = this.walletRepository.create({
      userId: savedUser.id,
      balance: 0.0,
    });
    await this.walletRepository.save(wallet);

    return savedUser;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async hasPin(id: string): Promise<boolean> {
    const user = await this.findById(id);
    return !!user.transactionPinHash;
  }

  async setPin(id: string, pin: string): Promise<void> {
    if (!/^\d{6}$/.test(pin)) {
      throw new BadRequestException('Transaction PIN must be exactly 6 digits');
    }
    const user = await this.findById(id);
    user.transactionPinHash = await bcrypt.hash(pin, 10);
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await this.userRepository.save(user);
  }

  async verifyPin(id: string, pin: string): Promise<boolean> {
    const user = await this.findById(id);
    if (!user.transactionPinHash) {
      throw new BadRequestException('Transaction PIN is not set');
    }

    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const remainingTime = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000 / 60);
      throw new BadRequestException(`Transaction PIN is locked. Try again in ${remainingTime} minute(s).`);
    }

    const isMatch = await bcrypt.compare(pin, user.transactionPinHash);
    if (isMatch) {
      if (user.pinAttempts > 0 || user.pinLockedUntil) {
        user.pinAttempts = 0;
        user.pinLockedUntil = null;
        await this.userRepository.save(user);
      }
      return true;
    } else {
      user.pinAttempts += 1;
      if (user.pinAttempts >= 5) {
        user.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await this.userRepository.save(user);
        throw new BadRequestException('Incorrect transaction PIN. Account has been locked for 15 minutes.');
      } else {
        await this.userRepository.save(user);
        const attemptsLeft = 5 - user.pinAttempts;
        throw new BadRequestException(`Incorrect transaction PIN. ${attemptsLeft} attempt(s) remaining.`);
      }
    }
  }
}
