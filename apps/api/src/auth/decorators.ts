import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './auth.types.js';

export const IS_PUBLIC = 'sugami:isPublic';
export const PERMISSIONS = 'sugami:permissions';

export const NEEDS_INTEGRATIONS = 'sugami:needsIntegrations';
export const PLATFORM_ADMIN = 'sugami:platformAdmin';

/** Route uses the Pancake/chat setup in env, which belongs to one shop: other shops get 403. */
export const RequireIntegrations = () => SetMetadata(NEEDS_INTEGRATIONS, true);

/** Route is for the platform operator (create shops and their accounts). */
export const RequirePlatformAdmin = () => SetMetadata(PLATFORM_ADMIN, true);

/** Route needs no login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs every listed permission (e.g. "inventory.write"). */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS, permissions);

/** Inject the logged-in user. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
