import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './auth.types.js';

export const IS_PUBLIC = 'sugami:isPublic';
export const PERMISSIONS = 'sugami:permissions';

/** Route needs no login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs every listed permission (e.g. "inventory.write"). */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS, permissions);

/** Inject the logged-in user. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
