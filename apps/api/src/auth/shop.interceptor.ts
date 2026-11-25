import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { DEFAULT_SHOP_ID, runAsShop } from '@sugami/db';
import { Observable } from 'rxjs';
import type { AuthUser } from './auth.types.js';

/**
 * Runs each request handler inside the logged-in user's shop, so every Prisma query of the request only
 * sees and writes that shop's rows. Public routes (webhooks) run as the first shop, Sugami.
 */
@Injectable()
export class ShopInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    return new Observable((subscriber) =>
      runAsShop(user?.shopId ?? DEFAULT_SHOP_ID, () => next.handle().subscribe(subscriber)),
    );
  }
}
