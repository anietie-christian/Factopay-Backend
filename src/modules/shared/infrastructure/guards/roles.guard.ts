import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard that enforces role-based access control.
 * Must be used AFTER JwtAuthGuard so that req.user is populated.
 *
 * Usage:
 *   @UseGuards(AuthGuard('jwt'), RolesGuard)
 *   @Roles('ADMIN', 'SUPERADMIN')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Read the allowed roles from the @Roles() decorator on the handler or class
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator is present, allow access (public admin route)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 2. Extract the authenticated user from the request (populated by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: no role assigned to this account.');
    }

    // 3. Check if the user's role is in the allowed roles list
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied: this action requires one of the following roles: [${requiredRoles.join(', ')}].`,
      );
    }

    return true;
  }
}
