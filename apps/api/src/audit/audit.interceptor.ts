import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { runAsActor } from '@sugami/db';
import { Observable } from 'rxjs';
import type { AuthUser } from '../auth/auth.types.js';

/** Runs each request handler with the logged-in user as the audit actor (set by AuthGuard). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    return new Observable((subscriber) =>
      runAsActor({ userId: user?.id }, () => next.handle().subscribe(subscriber)),
    );
  }
}
