import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from './auth.service';

/** Builds a guard that waits for the first /auth/me, then lets the route
 *  through if `allowed` holds. Logged-out visitors go to /login (and come back
 *  afterwards); logged-in users without access go home, where the landing
 *  explains their status. */
function roleGuard(allowed: (auth: AuthService) => boolean): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.whenReady().pipe(
      map((): boolean | UrlTree => {
        if (allowed(auth)) return true;
        if (!auth.isLoggedIn()) {
          return router.createUrlTree(['/login'], {
            queryParams: { next: state.url },
          });
        }
        return router.createUrlTree(['/']);
      }),
    );
  };
}

export const adminGuard = roleGuard((a) => a.isAdmin());
export const portfolioGuard = roleGuard((a) => a.canSeePortfolio());
export const approvedGuard = roleGuard((a) => a.isApproved());

/** Login/register pages bounce already-logged-in users home. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .whenReady()
    .pipe(map(() => (auth.isLoggedIn() ? router.createUrlTree(['/']) : true)));
};
