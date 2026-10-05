import { CommonModule } from '@angular/common';
import { Component, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TurnstileComponent } from '../components/turnstile.component';
import { AuthService } from '../services/auth.service';

/** One page for both /login and /register (route data `mode`). */
@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TurnstileComponent],
  template: `
    <div class="gate">
      <form (ngSubmit)="submit()" class="card">
        <img
          class="pin"
          src="assets/brand/marks/capybara-pin.svg"
          alt=""
          width="64"
          height="64"
        />
        <h1>captionato<span>photos</span></h1>
        <p class="sub">
          {{ isRegister ? 'Request access — I approve people by hand.' : 'Welcome back.' }}
        </p>

        <label>
          Username
          <input
            name="username"
            [(ngModel)]="username"
            autocomplete="username"
            required
            minlength="3"
            maxlength="32"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            [(ngModel)]="password"
            [autocomplete]="isRegister ? 'new-password' : 'current-password'"
            required
            [minlength]="isRegister ? 8 : 1"
          />
        </label>
        <label *ngIf="isRegister">
          Who are you?
          <textarea
            name="note"
            [(ngModel)]="note"
            rows="2"
            maxlength="300"
            placeholder="e.g. Sara — we met at the Cairo shoot"
          ></textarea>
          <small>So I know who I'm letting in.</small>
        </label>

        <app-turnstile #captcha (token)="captchaToken.set($event)"></app-turnstile>

        <p class="err" *ngIf="error()">{{ error() }}</p>

        <button
          class="btn-accent"
          type="submit"
          [disabled]="busy() || captchaToken() === null"
        >
          {{ busy() ? 'One sec…' : isRegister ? 'Create account' : 'Log in' }}
        </button>

        <p class="switch">
          <ng-container *ngIf="isRegister">
            Already have an account? <a routerLink="/login" [queryParams]="nextParams">Log in</a>
          </ng-container>
          <ng-container *ngIf="!isRegister">
            New here? <a routerLink="/register" [queryParams]="nextParams">Request access</a>
          </ng-container>
        </p>
      </form>
    </div>
  `,
  styles: [
    `
      .gate {
        min-height: calc(100vh - 70px);
        display: grid;
        place-items: center;
        padding: 1.5rem 1rem;
      }
      .card {
        width: 100%;
        max-width: 360px;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 2rem clamp(1.1rem, 5vw, 2rem);
      }
      .pin {
        display: block;
        width: 64px;
        height: 64px;
        margin: 0 auto -0.2rem;
        filter: drop-shadow(0 6px 14px rgba(20, 17, 16, 0.28));
      }
      h1 {
        font-family: var(--font-display);
        font-weight: 800;
        letter-spacing: -0.03em;
        text-align: center;
        margin: 0;
      }
      h1 span {
        color: var(--color-accent);
        margin-left: 0.15em;
      }
      .sub {
        text-align: center;
        color: var(--color-muted);
        margin: -0.6rem 0 0.6rem;
        font-size: 0.9rem;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.85rem;
        color: var(--color-muted);
      }
      label small {
        font-size: 0.75rem;
      }
      input,
      textarea {
        font-family: var(--font-body);
        font-size: 1rem;
        padding: 0.6rem 0.7rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
        resize: vertical;
      }
      input:focus,
      textarea:focus {
        outline: 2px solid var(--color-accent);
        border-color: transparent;
      }
      .err {
        color: var(--color-accent);
        font-size: 0.85rem;
        margin: 0;
      }
      button {
        margin-top: 0.4rem;
      }
      .switch {
        text-align: center;
        font-size: 0.85rem;
        color: var(--color-muted);
        margin: 0.2rem 0 0;
      }
      .switch a {
        color: var(--color-accent);
      }
    `,
  ],
})
export class AuthComponent {
  @ViewChild('captcha') captcha?: TurnstileComponent;

  readonly isRegister: boolean;
  readonly nextParams: { next?: string };
  username = '';
  password = '';
  note = '';
  /** null = captcha not solved yet; '' = no captcha configured (dev). */
  captchaToken = signal<string | null>(null);
  busy = signal(false);
  error = signal('');

  constructor(
    private auth: AuthService,
    private router: Router,
    route: ActivatedRoute,
  ) {
    this.isRegister = route.snapshot.data['mode'] === 'register';
    const next = route.snapshot.queryParamMap.get('next');
    this.nextParams = next ? { next } : {};
  }

  submit(): void {
    if (!this.username || !this.password) return;
    if (this.isRegister && this.password.length < 8) {
      this.error.set('Password needs at least 8 characters.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const req = this.isRegister
      ? this.auth.register(this.username, this.password, this.note, this.captchaToken())
      : this.auth.login(this.username, this.password, this.captchaToken());
    req.subscribe({
      next: () => this.router.navigateByUrl(this.safeNext()),
      error: (e) => {
        this.busy.set(false);
        this.captcha?.reset();
        this.error.set(this.messageFor(e));
      },
    });
  }

  /** Only follow same-site paths from ?next=, never an absolute URL. */
  private safeNext(): string {
    const next = this.nextParams.next ?? '/';
    return next.startsWith('/') && !next.startsWith('//') ? next : '/';
  }

  private messageFor(e: { status: number; error?: { detail?: unknown } }): string {
    const detail = typeof e.error?.detail === 'string' ? e.error.detail : '';
    if (e.status === 401) return 'Wrong username or password.';
    if (e.status === 409 || e.status === 400) return detail || 'Something went wrong.';
    if (e.status === 422) {
      return 'Usernames are 3–32 letters, numbers, dots, dashes or underscores; passwords at least 8 characters.';
    }
    return 'Something went wrong — try again.';
  }
}
