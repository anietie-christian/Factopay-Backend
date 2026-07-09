import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../shared/infrastructure/guards/roles.guard';
import { Roles } from '../../../shared/infrastructure/guards/roles.decorator';

import { AdminListUsersUseCase } from '../../application/use-cases/admin-list-users.use-case';
import { AdminGetUserDetailsUseCase } from '../../application/use-cases/admin-get-user-details.use-case';
import { AdminSuspendUserUseCase } from '../../application/use-cases/admin-suspend-user.use-case';
import { AdminUnsuspendUserUseCase } from '../../application/use-cases/admin-unsuspend-user.use-case';
import { AdminUpdateRoleUseCase } from '../../application/use-cases/admin-update-role.use-case';

import { AdminUsersQueryDto } from '../../application/dtos/admin-users-query.dto';
import { AdminSuspendUserDto } from '../../application/dtos/admin-suspend-user.dto';
import { AdminUpdateRoleDto } from '../../application/dtos/admin-update-role.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly listUsersUseCase: AdminListUsersUseCase,
    private readonly getUserDetailsUseCase: AdminGetUserDetailsUseCase,
    private readonly suspendUserUseCase: AdminSuspendUserUseCase,
    private readonly unsuspendUserUseCase: AdminUnsuspendUserUseCase,
    private readonly updateRoleUseCase: AdminUpdateRoleUseCase,
  ) {}

  @Get()
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get paginated list of all users' })
  @ApiResponse({ status: 200, description: 'Returns filtered list of users with profile summary' })
  async listUsers(@Query() query: AdminUsersQueryDto) {
    return this.listUsersUseCase.execute(query);
  }

  @Get(':userId')
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get full user details including profile, social login, and active sessions' })
  @ApiResponse({ status: 200, description: 'Returns full user detail object' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetails(@Param('userId') userId: string) {
    return this.getUserDetailsUseCase.execute(userId);
  }

  @Post(':userId/suspend')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a user account and revoke all sessions' })
  @ApiResponse({ status: 200, description: 'User suspended successfully' })
  @ApiResponse({ status: 400, description: 'User is already suspended or self-suspension is attempted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async suspendUser(
    @Param('userId') userId: string,
    @Body() dto: AdminSuspendUserDto,
    @Request() req: any,
    @Ip() ip: string,
  ) {
    return this.suspendUserUseCase.execute(userId, dto, req.user.id, ip);
  }

  @Post(':userId/unsuspend')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsuspend/reactivate a suspended user account' })
  @ApiResponse({ status: 200, description: 'User reactivated successfully' })
  @ApiResponse({ status: 400, description: 'User is already active' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unsuspendUser(@Param('userId') userId: string, @Request() req: any, @Ip() ip: string) {
    return this.unsuspendUserUseCase.execute(userId, req.user.id, ip);
  }

  @Patch(':userId/role')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Modify user access role (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid role update or self-role change' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateRole(
    @Param('userId') userId: string,
    @Body() dto: AdminUpdateRoleDto,
    @Request() req: any,
    @Ip() ip: string,
  ) {
    return this.updateRoleUseCase.execute(userId, dto, req.user.id, ip);
  }
}
