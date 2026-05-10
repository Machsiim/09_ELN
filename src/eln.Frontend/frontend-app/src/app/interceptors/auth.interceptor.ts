import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const AUTH_FREE_PATHS = ['/auth/login', '/auth/test-login'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isAuthFreePath = AUTH_FREE_PATHS.some((path) => req.url.includes(path));
  const token = authService.getToken();

  const outgoing = token && !isAuthFreePath
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthFreePath
      ) {
        authService.logout();
        const currentUrl = router.url;
        const alreadyOnLogin = currentUrl.startsWith('/login');
        if (!alreadyOnLogin) {
          router.navigate(['/login'], {
            queryParams: currentUrl !== '/' ? { returnUrl: currentUrl } : undefined
          });
        }
      }
      return throwError(() => error);
    })
  );
};
