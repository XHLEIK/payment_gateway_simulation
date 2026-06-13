import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Global guard utilizing Passport's JWT strategy to protect routes.
// Automatically verifies JWT tokens in authorization headers and attaches the decoded
// user payload to the request object.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
