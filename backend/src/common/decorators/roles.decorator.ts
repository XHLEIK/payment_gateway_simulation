import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/entities/user.entity';

export const ROLES_KEY = 'roles';

// Custom decorator to specify which user roles are permitted to access an endpoint.
// Attach this to controllers or specific routes.
// Usage: @Roles(UserRole.ADMIN)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
