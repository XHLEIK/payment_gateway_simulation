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

  // Handles registration of a new user. It also automatically sets up an empty wallet for them.
  async create(name: string, email: string, passwordHash: string, role: UserRole = UserRole.USER): Promise<User> {
    // Check if someone else already has this email
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

    // Every user needs a wallet, start it off with a 0.00 balance
    const wallet = this.walletRepository.create({
      userId: savedUser.id,
      balance: 0.0,
    });
    await this.walletRepository.save(wallet);

    return savedUser;
  }

  // Quick lookup to check if a user exists by email. Used by direct transfer & payment requests.
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  // Fetch a user by their UUID. Throws 404 if they don't exist.
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  // Admin utility to list all registered users (most recent first)
  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // Helper to check if the user has set up a transaction PIN yet
  async hasPin(id: string): Promise<boolean> {
    const user = await this.findById(id);
    return !!user.transactionPinHash;
  }

  // Set or update the 6-digit transaction PIN
  async setPin(id: string, pin: string): Promise<void> {
    // Standard validation to make sure it's exactly 6 numbers
    if (!/^\d{6}$/.test(pin)) {
      throw new BadRequestException('Transaction PIN must be exactly 6 digits');
    }
    const user = await this.findById(id);
    // Hash the PIN before storing it. Do not store plaintext pins!
    user.transactionPinHash = await bcrypt.hash(pin, 10);
    // Reset any locked state/attempts when they set a new PIN
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await this.userRepository.save(user);
  }

  // Verify the user's transaction PIN before executing a transfer or approving requests
  async verifyPin(id: string, pin: string): Promise<boolean> {
    const user = await this.findById(id);
    if (!user.transactionPinHash) {
      throw new BadRequestException('Transaction PIN is not set');
    }

    // Check if transaction PIN is currently locked (15-minute lockout window)
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const remainingMs = user.pinLockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new BadRequestException(
        `Transaction PIN is locked. Try again in ${remainingMin} minute(s).`
      );
    }

    // Verify bcrypt hash comparison
    const isMatch = await bcrypt.compare(pin, user.transactionPinHash);
    if (isMatch) {
      // Clear out the failures on a successful verification
      if (user.pinAttempts > 0 || user.pinLockedUntil) {
        user.pinAttempts = 0;
        user.pinLockedUntil = null;
        await this.userRepository.save(user);
      }
      return true;
    } else {
      // Log the failed attempt and save it
      user.pinAttempts += 1;

      if (user.pinAttempts >= 5) {
        // Trigger a 15-minute lockout on the 5th consecutive failure
        const lockDuration = 15 * 60 * 1000;
        user.pinLockedUntil = new Date(Date.now() + lockDuration);
        await this.userRepository.save(user);
        throw new BadRequestException(
          'Incorrect transaction PIN. Account PIN has been locked for 15 minutes.'
        );
      } else {
        await this.userRepository.save(user);
        const attemptsLeft = 5 - user.pinAttempts;
        throw new BadRequestException(`Incorrect transaction PIN. ${attemptsLeft} attempt(s) remaining.`);
      }
    }
  }
}
