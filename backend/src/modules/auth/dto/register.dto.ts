import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

// Data Transfer Object for candidate/user registration.
export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  // Enforces a minimum password length to reduce vulnerable credentials
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  password: string;

  // Role selection. Optional; defaults to 'USER' in users.service
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  captchaToken: string;
}
