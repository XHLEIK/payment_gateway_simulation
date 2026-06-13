import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Custom parameter decorator to easily grab the authenticated user details
// from the HTTP request context (injected by JwtAuthGuard).
// Usage: @CurrentUser() user: User
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // request.user is populated by passport-jwt when authentication succeeds
    return request.user;
  },
);
