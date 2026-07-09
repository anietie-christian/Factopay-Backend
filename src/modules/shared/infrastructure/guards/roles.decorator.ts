import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Custom decorator to restrict endpoint access to specific user roles.
 * Usage: @Roles('ADMIN', 'SUPERADMIN')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
