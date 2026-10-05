import { Injectable, computed, signal } from '@angular/core';
import { Observable, ReplaySubject, catchError, of, switchMap, take, tap } from 'rxjs';

import { Gallery, Me } from '../models';
import { ApiService } from './api.service';

const TOKEN_KEY = 'captionato_token';
/** While pending, re-check the role this often so approval shows up live. */
const PENDING_POLL_MS = 30_000;

/** Holds the JWT (in localStorage), the current user, and the galleries their
 *  role/grants give them. The role is always re-read from the API, never from
 *  the token, so approvals and revocations apply without re-login. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(readToken());
  readonly token = this._token.asReadonly();
  readonly me = signal<Me | null>(null);
  /** The caller's gallery menu (all galleries for admin). */
  readonly galleries = signal<Gallery[]>([]);

  readonly isLoggedIn = computed(() => this.me() !== null);
  readonly isPending = computed(() => this.me()?.role === 'pending');
  readonly isApproved = computed(() => {
    const r = this.me()?.role;
    return r === 'client' || r === 'verified' || r === 'admin';
  });
  readonly canSeePortfolio = computed(() => {
    const r = this.me()?.role;
    return r === 'verified' || r === 'admin';
  });
  readonly isAdmin = computed(() => this.me()?.role === 'admin');

  /** Emits (and replays) once the first /auth/me resolution has finished, so
   *  guards can wait for it on a hard refresh. */
  private ready$ = new ReplaySubject<Me | null>(1);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private api: ApiService) {
    // Deferred: the request runs through the auth interceptor, which injects
    // this service — calling it mid-construction is a circular-DI error.
    queueMicrotask(() => this.refresh().subscribe((me) => this.ready$.next(me)));
  }

  whenReady(): Observable<Me | null> {
    return this.ready$.pipe(take(1));
  }

  /** Resolves to the logged-in user once their role has been loaded. */
  login(username: string, password: string, captcha: string | null) {
    return this.api.login(username, password, captcha).pipe(
      tap((res) => this.setToken(res.access_token)),
      switchMap(() => this.refresh()),
    );
  }

  register(username: string, password: string, note: string, captcha: string | null) {
    return this.api.register({ username, password, note, turnstile_token: captcha }).pipe(
      tap((res) => this.setToken(res.access_token)),
      switchMap(() => this.refresh()),
    );
  }

  /** Re-read the current user (and their galleries) from the API. */
  refresh(): Observable<Me | null> {
    if (!this._token()) {
      this.applyMe(null);
      return of(null);
    }
    return this.api.me().pipe(
      tap((me) => this.applyMe(me)),
      catchError((err) => {
        // Stale token (expired / user deleted): drop it quietly. Any other
        // error (API down) keeps the token for the next refresh.
        if (err?.status === 401) this.logout();
        else this.applyMe(null);
        return of(null);
      }),
    );
  }

  logout() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable — the in-memory token is cleared below anyway */
    }
    this._token.set(null);
    this.applyMe(null);
  }

  private setToken(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode — stay logged in for this tab only */
    }
    this._token.set(token);
  }

  private applyMe(me: Me | null) {
    this.me.set(me);
    if (this.isApproved()) {
      this.api.getGalleries().subscribe({
        next: (g) => this.galleries.set(g),
        error: () => this.galleries.set([]),
      });
    } else {
      this.galleries.set([]);
    }
    this.syncPendingPoll();
  }

  private syncPendingPoll() {
    if (this.isPending() && !this.pollTimer) {
      this.pollTimer = setInterval(() => this.refresh().subscribe(), PENDING_POLL_MS);
    } else if (!this.isPending() && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
