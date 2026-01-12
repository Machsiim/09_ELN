import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt?: string;
}

export interface User {
  id: number;
  username: string;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/auth`;

  private readonly TOKEN_KEY = 'eln_auth_token';
  private readonly USER_KEY = 'eln_user';

  currentUser = signal<User | null>(this.loadUserFromStorage());
  isAuthenticated = signal<boolean>(this.hasValidToken());

  constructor() {
    this.loadUserFromStorage();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    const payload: LoginRequest = { username, password };

    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, payload).pipe(
      tap(response => {
        this.setSession(response);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private setSession(authResult: LoginResponse): void {
    localStorage.setItem(this.TOKEN_KEY, authResult.token);

    const decodedToken = this.decodeToken(authResult.token);

    const user: User = {
      id: 0,
      username: decodedToken?.username || 'Unknown',
      role: decodedToken?.role || 'User'
    };

    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
  }

  private decodeToken(token: string): { username: string; role: string } | null {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return {
        username: decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || decoded.name || decoded.sub,
        role: decoded['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || decoded.role
      };
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  private loadUserFromStorage(): User | null {
    const userJson = localStorage.getItem(this.USER_KEY);
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        return null;
      }
    }
    return null;
  }

  private hasValidToken(): boolean {
    return !!this.getToken();
  }

  getCurrentRole(): string | null {
    return this.currentUser()?.role || null;
  }

  isStaff(): boolean {
    return this.getCurrentRole() === 'Staff';
  }

  isStudent(): boolean {
    return this.getCurrentRole() === 'Student';
  }
}
