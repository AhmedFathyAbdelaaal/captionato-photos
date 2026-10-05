import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/** Attaches the JWT and, when a stored token gets a 401 (expired, user
 *  deleted), drops it and sends the user to the login page. Login/register
 *  401s are just wrong credentials, and /auth/me is AuthService's own check
 *  (it drops the token quietly), so those are left to their callers. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.token();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err) => {
      const handledByCaller = /\/auth\/(login|register|me)$/.test(req.url);
      if (err.status === 401 && token && !handledByCaller) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
