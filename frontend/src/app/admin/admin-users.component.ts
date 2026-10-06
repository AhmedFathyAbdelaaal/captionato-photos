import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminUser, Gallery, UserRole } from '../models';
import { AdminStateService } from '../services/admin-state.service';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';

type Filter = 'all' | UserRole;

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'pending', label: 'Pending', hint: 'Landing hero only' },
  { value: 'client', label: 'Client', hint: 'Only galleries ticked below' },
  { value: 'verified', label: 'Verified', hint: 'Portfolio + galleries ticked below' },
  { value: 'admin', label: 'Admin', hint: 'Everything, incl. this panel' },
];

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top">
      <h1>Users</h1>
      <span class="mono muted" *ngIf="users().length">
        {{ users().length }} total · {{ pending().length }} pending
      </span>
    </header>

    <div class="filters" role="tablist">
      <button
        *ngFor="let f of filters"
        type="button"
        class="filter"
        [class.on]="filter() === f.value"
        (click)="filter.set(f.value)"
      >
        {{ f.label }}
        <span class="mono">{{ countFor(f.value) }}</span>
      </button>
    </div>

    <div class="toast" *ngIf="toast()" role="status">{{ toast() }}</div>
    <p class="muted" *ngIf="!loading() && !shown().length">Nobody here yet.</p>

    <ul class="list">
      <li *ngFor="let u of shown(); trackBy: trackId" class="user" [class.pending]="u.role === 'pending'">
        <div class="head">
          <div class="who">
            <b>{{ u.username }}</b>
            <span class="you mono" *ngIf="u.id === meId()">you</span>
            <span class="mono muted dates">
              joined {{ u.created_at | date: 'd MMM y' }}
              <ng-container *ngIf="u.last_login_at"> · last seen {{ u.last_login_at | date: 'd MMM' }}</ng-container>
            </span>
          </div>
          <span class="chips-right">
            <span class="role-chip mono elevated" *ngIf="u.can_download && u.role !== 'admin'">⭐ elevated</span>
            <span class="role-chip mono" [attr.data-role]="u.role">{{ u.role }}</span>
          </span>
        </div>

        <p class="note" *ngIf="u.note">“{{ u.note }}”</p>

        <!-- Quick approve for pending sign-ups -->
        <div class="approve" *ngIf="u.role === 'pending'">
          <button class="btn-accent" (click)="setRole(u, 'verified')">Approve · Verified</button>
          <button class="btn-ghost" (click)="setRole(u, 'client')">Approve · Client</button>
        </div>

        <div class="roles" *ngIf="u.role !== 'pending' || expanded().has(u.id)">
          <label
            *ngFor="let r of roles"
            class="role"
            [class.on]="u.role === r.value"
            [class.disabled]="u.id === meId()"
            [title]="r.hint"
          >
            <input
              type="radio"
              [name]="'role-' + u.id"
              [checked]="u.role === r.value"
              [disabled]="u.id === meId()"
              (change)="setRole(u, r.value)"
            />
            {{ r.label }}
          </label>
        </div>

        <label class="elevate" *ngIf="u.role !== 'admin'">
          <input
            type="checkbox"
            [checked]="u.can_download"
            (change)="setElevated(u, $any($event.target).checked)"
          />
          <span>
            <b>⭐ Elevated</b>
            <small class="muted">
              Download originals everywhere they can see. Without it, only in their galleries below.
            </small>
          </span>
        </label>

        <div class="grants" *ngIf="u.role !== 'admin' && galleries().length">
          <span class="lbl mono">Galleries</span>
          <button
            type="button"
            class="chip"
            *ngFor="let g of galleries()"
            [class.on]="u.gallery_ids.includes(g.id)"
            (click)="toggleGallery(u, g)"
          >
            <span *ngIf="g.visibility === 'password'">🔒</span>
            {{ g.name }}
            <span class="tick" aria-hidden="true">✓</span>
          </button>
          <small class="muted" *ngIf="u.role === 'pending' && u.gallery_ids.length">
            Grants apply once approved.
          </small>
        </div>

        <div class="actions">
          <button class="link" *ngIf="u.role === 'pending'" (click)="toggleExpanded(u)">
            {{ expanded().has(u.id) ? 'hide roles' : 'all roles' }}
          </button>
          <ng-container *ngIf="resetFor() !== u.id">
            <button class="link" (click)="startReset(u)">reset password</button>
          </ng-container>
          <form class="reset" *ngIf="resetFor() === u.id" (ngSubmit)="submitReset(u)">
            <input
              type="text"
              name="pw"
              [(ngModel)]="resetPw"
              placeholder="new password (8+ chars)"
              autocomplete="off"
            />
            <button class="btn-ghost small" type="submit" [disabled]="resetPw.length < 8">Set</button>
            <button class="link" type="button" (click)="resetFor.set(null)">cancel</button>
          </form>
          <button class="link danger" *ngIf="u.id !== meId()" (click)="remove(u)">delete</button>
        </div>
      </li>
    </ul>
  `,
  styles: [
    `
      .top {
        display: flex;
        align-items: baseline;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .top h1 {
        margin: 0;
      }
      .muted {
        color: var(--color-muted);
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 1.2rem 0;
      }
      .filter {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.3rem 0.8rem;
        color: var(--color-muted);
        font-family: var(--font-display);
        font-size: 0.85rem;
        cursor: pointer;
      }
      .filter span {
        margin-left: 0.3rem;
        font-size: 0.75rem;
      }
      .filter.on {
        color: var(--color-ink);
        border-color: var(--color-accent);
      }
      .toast {
        position: fixed;
        bottom: 1.2rem;
        right: 1.2rem;
        z-index: 60;
        background: var(--color-ink);
        color: var(--color-paper);
        padding: 0.6rem 1rem;
        border-radius: var(--radius);
        font-size: 0.85rem;
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        max-width: 860px;
      }
      .user {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 1rem 1.1rem;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .user.pending {
        border-color: var(--color-accent);
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.8rem;
      }
      .who {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.3rem 0.6rem;
        min-width: 0;
      }
      .who b {
        font-family: var(--font-display);
        font-size: 1.05rem;
        overflow-wrap: anywhere;
      }
      .you {
        font-size: 0.7rem;
        color: var(--color-accent);
      }
      .dates {
        font-size: 0.75rem;
      }
      .chips-right {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.35rem;
      }
      .role-chip.elevated {
        color: var(--cap-brass-deep);
        box-shadow: inset 0 0 0 1px var(--cap-brass);
        text-transform: none;
        letter-spacing: 0;
      }
      [data-theme='dark'] .role-chip.elevated {
        color: var(--cap-brass-bright);
      }
      .elevate {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .elevate input {
        accent-color: var(--color-accent);
        margin: 0.2rem 0 0;
      }
      .elevate span {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }
      .elevate small {
        font-size: 0.75rem;
      }
      .role-chip {
        flex: none;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px var(--color-border);
        color: var(--color-muted);
      }
      .role-chip[data-role='pending'] {
        color: var(--color-accent);
        box-shadow: inset 0 0 0 1px var(--color-accent);
      }
      .role-chip[data-role='verified'] {
        color: var(--cap-capy);
        box-shadow: inset 0 0 0 1px var(--cap-capy);
      }
      .role-chip[data-role='client'] {
        color: var(--cap-brass-deep);
        box-shadow: inset 0 0 0 1px var(--cap-brass);
      }
      .note {
        margin: 0;
        font-style: italic;
        color: var(--color-ink);
        overflow-wrap: anywhere;
      }
      .approve {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .roles {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .role {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.3rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.85rem;
        cursor: pointer;
      }
      .role input {
        accent-color: var(--color-accent);
        margin: 0;
      }
      .role.on {
        border-color: var(--color-accent);
      }
      .role.disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .grants {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
      }
      .lbl {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-muted);
        margin-right: 0.2rem;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        background: transparent;
        border: 1px dashed var(--color-border);
        border-radius: 999px;
        padding: 0.25rem 0.7rem;
        color: var(--color-muted);
        font-size: 0.82rem;
        cursor: pointer;
      }
      .chip .tick {
        display: none;
      }
      .chip.on {
        border-style: solid;
        border-color: var(--color-accent);
        color: var(--color-ink);
      }
      .chip.on .tick {
        display: inline;
        color: var(--color-accent);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem 1rem;
        font-size: 0.82rem;
      }
      .link {
        background: none;
        border: 0;
        padding: 0;
        color: var(--color-muted);
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
        font: inherit;
      }
      .link.danger {
        color: var(--color-accent);
        margin-left: auto;
      }
      .reset {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
      }
      .reset input {
        font-family: var(--font-mono);
        font-size: 0.85rem;
        padding: 0.35rem 0.5rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
        min-width: 0;
      }
      .small {
        padding: 0.35rem 0.8rem;
        font-size: 0.82rem;
      }
    `,
  ],
})
export class AdminUsersComponent implements OnInit {
  readonly roles = ROLES;
  readonly filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...ROLES.map((r) => ({ value: r.value as Filter, label: r.label })),
  ];

  users = signal<AdminUser[]>([]);
  galleries = signal<Gallery[]>([]);
  loading = signal(true);
  filter = signal<Filter>('all');
  expanded = signal<Set<string>>(new Set());
  resetFor = signal<string | null>(null);
  resetPw = '';
  toast = signal('');

  meId = computed(() => this.auth.me()?.id);
  pending = computed(() => this.users().filter((u) => u.role === 'pending'));
  shown = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.users() : this.users().filter((u) => u.role === f);
  });

  trackId = (_: number, u: AdminUser) => u.id;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private adminState: AdminStateService,
  ) {}

  ngOnInit(): void {
    this.api.getUsers().subscribe({
      next: (u) => {
        this.users.set(u);
        this.loading.set(false);
        this.syncBadge();
      },
      error: () => this.loading.set(false),
    });
    this.api.getAdminGalleries().subscribe({ next: (g) => this.galleries.set(g) });
  }

  countFor(f: Filter): number {
    return f === 'all' ? this.users().length : this.users().filter((u) => u.role === f).length;
  }

  setRole(u: AdminUser, role: UserRole): void {
    if (u.role === role) return;
    this.save(u, { role }, `${u.username} → ${role}`);
  }

  setElevated(u: AdminUser, on: boolean): void {
    this.save(u, { can_download: on }, `${u.username} ${on ? 'elevated ⭐' : 'no longer elevated'}`);
  }

  toggleGallery(u: AdminUser, g: Gallery): void {
    const ids = u.gallery_ids.includes(g.id)
      ? u.gallery_ids.filter((id) => id !== g.id)
      : [...u.gallery_ids, g.id];
    this.save(u, { gallery_ids: ids });
  }

  toggleExpanded(u: AdminUser): void {
    const next = new Set(this.expanded());
    next.has(u.id) ? next.delete(u.id) : next.add(u.id);
    this.expanded.set(next);
  }

  startReset(u: AdminUser): void {
    this.resetPw = '';
    this.resetFor.set(u.id);
  }

  submitReset(u: AdminUser): void {
    this.api.resetUserPassword(u.id, this.resetPw).subscribe({
      next: () => {
        this.resetFor.set(null);
        this.showToast(`Password set — send it to ${u.username}`);
      },
      error: () => this.showToast('Reset failed'),
    });
  }

  remove(u: AdminUser): void {
    if (!confirm(`Delete ${u.username}? They'll lose access immediately.`)) return;
    this.api.deleteUser(u.id).subscribe({
      next: () => {
        this.users.set(this.users().filter((x) => x.id !== u.id));
        this.syncBadge();
        this.showToast(`${u.username} deleted`);
      },
      error: () => this.showToast('Delete failed'),
    });
  }

  private save(
    u: AdminUser,
    body: { role?: UserRole; can_download?: boolean; gallery_ids?: string[] },
    okMsg?: string,
  ): void {
    this.api.updateUser(u.id, body).subscribe({
      next: (fresh) => {
        this.users.set(this.users().map((x) => (x.id === fresh.id ? fresh : x)));
        this.syncBadge();
        if (okMsg) this.showToast(okMsg);
      },
      error: (e) => this.showToast(e.error?.detail || 'Save failed'),
    });
  }

  private syncBadge(): void {
    this.adminState.pendingCount.set(this.pending().length);
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => {
      if (this.toast() === msg) this.toast.set('');
    }, 2400);
  }
}
