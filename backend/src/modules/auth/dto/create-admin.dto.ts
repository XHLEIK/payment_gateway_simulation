import { IsEmail, IsString, MinLength } from 'class-validator';

// Data Transfer Object for secure admin creation.
export class CreateAdminDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  password: string;

  @IsString()
  @MinLength(12, { message: 'Password confirmation must be at least 12 characters long' })
  confirmPassword: string;
}
