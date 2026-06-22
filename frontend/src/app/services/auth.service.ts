import { Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';

import { ApiService } from './api.service';

const TOKEN_KEY = 'captionato_token';

/** Holds the JWT (in localStorage) and tracks admin auth state. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly token = this._token.asReadonly();
  readonly isAuthed = signal<boolean>(!!localStorage.getItem(TOKEN_KEY));

  constructor(private api: ApiService) {}

  login(username: string, password: string) {
    return this.api.login(username, password).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.access_token);
        this._token.set(res.access_token);
        this.isAuthed.set(true);
      }),
    );
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this._token.set(null);
    this.isAuthed.set(false);
  }
}
