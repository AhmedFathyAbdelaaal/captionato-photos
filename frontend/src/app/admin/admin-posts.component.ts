import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { Post } from '../models';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-admin-posts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top">
      <h1>Posts</h1>
      <button class="btn-accent" (click)="startNew()">+ New post</button>
    </header>
    <p class="sub muted">
      Multi-slide carousels for Instagram — build each slide like a collage, then
      export the whole set as a zip.
    </p>
    <p class="err" *ngIf="error()">{{ error() }}</p>

    <!-- New post form -->
    <form class="new" *ngIf="showNew()" (ngSubmit)="create()">
      <input
        [(ngModel)]="draftName"
        name="name"
        placeholder="Post name (e.g. “Autumn trip”)"
        maxlength="120"
        autofocus
        required
      />
      <button class="btn-accent" type="submit" [disabled]="!draftName.trim() || busy()">
        {{ busy() ? 'Creating…' : 'Create' }}
      </button>
      <button class="btn-ghost" type="button" (click)="showNew.set(false)">Cancel</button>
    </form>

    <div class="grid" *ngIf="posts().length; else empty">
      <div class="card" *ngFor="let p of posts()">
        <button class="preview" (click)="open(p)" [title]="'Open ' + p.name">
          <img *ngIf="p.cover_thumb_url" [src]="api.imageUrl(p.cover_thumb_url)" alt="" />
          <span class="no-cover" *ngIf="!p.cover_thumb_url">◔</span>
          <span class="slides mono">{{ p.slide_count }} ◈</span>
        </button>
        <div class="meta">
          <strong class="name">{{ p.name }}</strong>
          <span class="badge" [class.exported]="p.status === 'exported'">{{ p.status }}</span>
          <span class="muted small">{{ p.updated_at | date: 'MMM d, HH:mm' }}</span>
        </div>
        <button class="btn-ghost danger small" (click)="remove(p)">Delete</button>
      </div>
    </div>
    <ng-template #empty>
      <p class="muted" *ngIf="!loading()">No posts yet — create your first carousel.</p>
    </ng-template>
  `,
  styles: [
    `
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sub {
        margin: 0.2rem 0 1.2rem;
        max-width: 60ch;
        font-size: 0.9rem;
      }
      .muted { color: var(--color-muted); }
      .err { color: var(--color-accent); }
      .new {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.4rem;
        flex-wrap: wrap;
      }
      .new input {
        flex: 1 1 260px;
        font-family: var(--font-body);
        padding: 0.55rem 0.7rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: calc(var(--radius) * 2);
        padding: 0.7rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .preview {
        position: relative;
        aspect-ratio: 1;
        border: none;
        border-radius: var(--radius);
        overflow: hidden;
        background: var(--color-paper);
        cursor: pointer;
        padding: 0;
      }
      .preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .no-cover {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        font-family: var(--font-display);
        font-size: 1.8rem;
        color: var(--cap-capy);
      }
      .slides {
        position: absolute;
        right: 0.4rem;
        bottom: 0.4rem;
        font-size: 0.72rem;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--cap-ink) 66%, transparent);
        color: var(--cap-cream-hi);
      }
      .meta {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .name {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .badge {
        width: fit-content;
        font-family: var(--font-mono);
        font-size: 0.68rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        color: var(--color-muted);
        box-shadow: inset 0 0 0 1px var(--color-border);
      }
      .badge.exported {
        color: var(--cap-capy);
        box-shadow: inset 0 0 0 1px var(--cap-capy);
      }
      .small { font-size: 0.78rem; }
      .danger { color: var(--color-accent); border-color: var(--color-accent); }
      .btn-ghost.small { padding: 0.35rem 0.7rem; }
    `,
  ],
})
export class AdminPostsComponent implements OnInit {
  posts = signal<Post[]>([]);
  loading = signal(true);
  showNew = signal(false);
  busy = signal(false);
  error = signal('');
  draftName = '';

  constructor(public api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.api.getPosts().subscribe({
      next: (p) => {
        this.posts.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  startNew(): void {
    this.draftName = '';
    this.showNew.set(true);
  }

  create(): void {
    const name = this.draftName.trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set('');
    this.api.createPost(name).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.router.navigate(['/admin/posts', p.id]);
      },
      error: (e) => {
        this.error.set(e.error?.detail || 'Could not create post.');
        this.busy.set(false);
      },
    });
  }

  open(p: Post): void {
    this.router.navigate(['/admin/posts', p.id]);
  }

  remove(p: Post): void {
    if (!confirm(`Delete post “${p.name}” and all its slides? This cannot be undone.`)) return;
    this.api.deletePost(p.id).subscribe(() => {
      this.posts.update((cur) => cur.filter((x) => x.id !== p.id));
    });
  }
}
