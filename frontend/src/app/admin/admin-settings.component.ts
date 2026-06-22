import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top"><h1>Settings</h1></header>

    <form class="card" (ngSubmit)="submit()">
      <h2>Change password</h2>
      <label>Current password<input type="password" [(ngModel)]="current" name="current" required /></label>
      <label>New password<input type="password" [(ngModel)]="next" name="next" required minlength="6" /></label>
      <label>Confirm new password<input type="password" [(ngModel)]="confirm" name="confirm" required /></label>

      <p class="msg" [class.ok]="ok()" *ngIf="msg()">{{ msg() }}</p>
      <button class="btn-accent" type="submit" [disabled]="busy()">
        {{ busy() ? 'Saving…' : 'Update password' }}
      </button>
    </form>
  `,
  styles: [
    `
      .card {
        max-width: 380px;
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 1.5rem;
        margin-top: 1rem;
      }
      h2 {
        margin: 0;
        font-size: 1.1rem;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.82rem;
        color: var(--color-muted);
      }
      input {
        font-family: var(--font-body);
        padding: 0.55rem 0.6rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      .msg {
        color: var(--color-accent);
        font-size: 0.85rem;
        margin: 0;
      }
      .msg.ok {
        color: var(--color-muted);
      }
    `,
  ],
})
export class AdminSettingsComponent {
  current = '';
  next = '';
  confirm = '';
  busy = signal(false);
  ok = signal(false);
  msg = signal('');

  constructor(private api: ApiService) {}

  submit(): void {
    this.msg.set('');
    if (this.next.length < 6) {
      this.ok.set(false);
      this.msg.set('New password must be at least 6 characters.');
      return;
    }
    if (this.next !== this.confirm) {
      this.ok.set(false);
      this.msg.set('New passwords do not match.');
      return;
    }
    this.busy.set(true);
    this.api.changePassword(this.current, this.next).subscribe({
      next: () => {
        this.ok.set(true);
        this.msg.set('Password updated.');
        this.current = this.next = this.confirm = '';
        this.busy.set(false);
      },
      error: (e) => {
        this.ok.set(false);
        this.msg.set(e.error?.detail || 'Could not update password.');
        this.busy.set(false);
      },
    });
  }
}
