import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="gate">
      <form (ngSubmit)="submit()" class="card">
        <h1>captionato<span>photos</span></h1>
        <p class="sub">Admin access</p>

        <label>
          Username
          <input name="username" [(ngModel)]="username" autocomplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            [(ngModel)]="password"
            autocomplete="current-password"
            required
          />
        </label>

        <p class="err" *ngIf="error()">{{ error() }}</p>

        <button class="btn-accent" type="submit" [disabled]="busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .gate {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }
      .card {
        width: 100%;
        max-width: 340px;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 2rem;
      }
      h1 {
        font-family: var(--font-display);
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
      input {
        font-family: var(--font-body);
        font-size: 1rem;
        padding: 0.6rem 0.7rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      input:focus {
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
    `,
  ],
})
export class LoginComponent {
  username = '';
  password = '';
  busy = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    if (!this.username || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigate(['/admin']),
      error: (e) => {
        this.error.set(
          e.status === 401 ? 'Invalid username or password.' : 'Login failed.',
        );
        this.busy.set(false);
      },
    });
  }
}
