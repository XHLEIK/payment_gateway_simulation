import { IsEmail, IsString, IsOptional } from 'class-validator';

// Data Transfer Object for validating candidate and admin logins.
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  captchaToken?: string;
}
