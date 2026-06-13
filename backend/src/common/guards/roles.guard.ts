import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../modules/users/entities/user.entity';

// Authorization guard that handles Role-Based Access Control (RBAC).
// Runs after JwtAuthGuard to check if the authenticated user has one of the
// required roles to execute the target route.
@Injectable()
export class RolesGuard implements CanActivate {
  // Reflector helps read custom metadata (like allowed roles) attached to routes
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Retrieve required roles for the handler (method) or class (controller)
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    // If no roles are specified, the endpoint is open to any authenticated user
    if (!requiredRoles) {
      return true;
    }
    
    // Grab the user entity attached to the request by JwtAuthGuard
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false; // No user means unauthorized
    }
    
    // Check if the user's role matches any of the required roles
    return requiredRoles.includes(user.role);
  }
}
