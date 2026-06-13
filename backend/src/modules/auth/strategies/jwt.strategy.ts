import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      // Read the JWT bearer token directly from the request headers
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') || 'default_fallback_secret_key_2026',
    });
  }

  // Once Passport decodes and validates the token, it triggers this method.
  // The object returned here is injected into req.user by NestJS.
  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
