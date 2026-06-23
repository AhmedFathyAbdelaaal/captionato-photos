import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Gallery, GalleryInput, GalleryLayout, ForceTheme } from '../models';
import { ApiService } from '../services/api.service';

const LAYOUTS: GalleryLayout[] = [
  'masonry',
  'grid',
  'editorial',
  'slideshow',
  'moodboard',
];
const THEMES: ForceTheme[] = ['system', 'light', 'dark'];

@Component({
  selector: 'app-admin-galleries',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top"><h1>Galleries</h1></header>

    <!-- Create -->
    <form class="create" (ngSubmit)="create()">
      <input [(ngModel)]="draft.name" name="name" placeholder="Gallery name" required (input)="autoSlug()" />
      <input [(ngModel)]="draft.slug" name="slug" placeholder="slug" required />
      <button class="btn-accent" type="submit" [disabled]="!draft.name || !draft.slug">Add</button>
    </form>
    <p class="err" *ngIf="error()">{{ error() }}</p>

    <!-- List -->
    <ul class="list">
      <li class="row" *ngFor="let g of galleries(); let i = index">
        <div class="cover">
          <img *ngIf="g.cover_thumbnail_url" [src]="api.imageUrl(g.cover_thumbnail_url)" [alt]="g.name" />
        </div>
        <div class="info">
          <strong>{{ g.name }}</strong>
          <span class="mono muted">/{{ g.slug }} · {{ g.photo_count }} · {{ g.layout }}</span>
        </div>
        <div class="ord">
          <button (click)="move(i, -1)" [disabled]="i === 0">↑</button>
          <button (click)="move(i, 1)" [disabled]="i === galleries().length - 1">↓</button>
        </div>
        <button class="btn-ghost" (click)="expand.set(expand() === g.id ? null : g.id)">Edit</button>

        <!-- Editor -->
        <div class="editor" *ngIf="expand() === g.id">
          <label>Name<input [(ngModel)]="g.name" name="n{{ g.id }}" /></label>
          <label>Slug<input [(ngModel)]="g.slug" name="s{{ g.id }}" /></label>
          <label>Description<textarea [(ngModel)]="g.description" rows="2" name="d{{ g.id }}"></textarea></label>
          <label>
            Layout
            <select [(ngModel)]="g.layout" name="l{{ g.id }}">
              <option *ngFor="let l of layouts" [value]="l">{{ l }}</option>
            </select>
          </label>
          <label>
            Theme
            <select [(ngModel)]="g.force_theme" name="t{{ g.id }}">
              <option *ngFor="let t of themes" [value]="t">{{ t }}</option>
            </select>
          </label>
          <label class="accent">
            Accent
            <input type="color" [ngModel]="g.accent_color || '#b23a52'" (ngModelChange)="g.accent_color = $event" name="a{{ g.id }}" />
            <button type="button" class="clear" (click)="g.accent_color = null">default</button>
          </label>
          <div class="actions">
            <button class="btn-accent" (click)="saveEdit(g)">Save</button>
            <button class="btn-ghost danger" (click)="remove(g)">Delete</button>
          </div>
        </div>
      </li>
    </ul>

    <p class="muted" *ngIf="!loading() && galleries().length === 0">No galleries yet.</p>
  `,
  styles: [
    `
      .create {
        display: flex;
        gap: 0.5rem;
        margin: 1.2rem 0;
        flex-wrap: wrap;
      }
      input,
      textarea,
      select {
        font-family: var(--font-body);
        padding: 0.5rem 0.6rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      .err {
        color: var(--color-accent);
      }
      .list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .row {
        display: grid;
        grid-template-columns: 56px 1fr auto auto;
        align-items: center;
        gap: 0.8rem;
        padding: 0.6rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
      }
      .cover {
        width: 56px;
        height: 56px;
        border-radius: var(--radius);
        overflow: hidden;
        background: var(--color-paper);
      }
      .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .info {
        display: flex;
        flex-direction: column;
      }
      .muted {
        color: var(--color-muted);
        font-size: 0.8rem;
      }
      .ord {
        display: flex;
        gap: 0.2rem;
      }
      .ord button {
        width: 1.9rem;
        height: 1.9rem;
        border: 1px solid var(--color-border);
        background: var(--color-paper);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      .ord button:disabled {
        opacity: 0.3;
      }
      .editor {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.6rem;
        padding-top: 0.6rem;
        border-top: 1px solid var(--color-border);
      }
      .editor label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.8rem;
        color: var(--color-muted);
      }
      .accent {
        flex-direction: row !important;
        align-items: center;
        gap: 0.4rem !important;
      }
      .clear {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-muted);
        padding: 0.2rem 0.4rem;
      }
      .actions {
        grid-column: 1 / -1;
        display: flex;
        gap: 0.5rem;
      }
      .danger {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }
      @media (max-width: 560px) {
        .row {
          grid-template-columns: 48px 1fr auto;
        }
        /* Move the reorder arrows onto their own line on narrow screens. */
        .ord {
          grid-row: 2;
          grid-column: 1 / -1;
          justify-content: flex-end;
        }
        .create input {
          flex: 1 1 100%;
        }
      }
    `,
  ],
})
export class AdminGalleriesComponent implements OnInit {
  galleries = signal<Gallery[]>([]);
  loading = signal(true);
  expand = signal<string | null>(null);
  error = signal('');
  draft: GalleryInput = { name: '', slug: '' };
  layouts = LAYOUTS;
  themes = THEMES;

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getGalleries().subscribe({
      next: (g) => {
        this.galleries.set(g);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  autoSlug(): void {
    this.draft.slug = this.draft.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  create(): void {
    this.error.set('');
    this.api.createGallery(this.draft).subscribe({
      next: (g) => {
        this.galleries.update((cur) => [...cur, g]);
        this.draft = { name: '', slug: '' };
      },
      error: (e) => this.error.set(e.error?.detail || 'Could not create gallery.'),
    });
  }

  saveEdit(g: Gallery): void {
    this.api
      .updateGallery(g.id, {
        name: g.name,
        slug: g.slug,
        description: g.description,
        layout: g.layout,
        force_theme: g.force_theme,
        accent_color: g.accent_color,
      })
      .subscribe({
        next: () => this.expand.set(null),
        error: (e) => this.error.set(e.error?.detail || 'Save failed.'),
      });
  }

  remove(g: Gallery): void {
    if (!confirm(`Delete gallery "${g.name}"? Photos stay, just unassigned.`)) return;
    this.api.deleteGallery(g.id).subscribe(() => {
      this.galleries.update((cur) => cur.filter((x) => x.id !== g.id));
      this.expand.set(null);
    });
  }

  move(index: number, dir: -1 | 1): void {
    const arr = [...this.galleries()];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    this.galleries.set(arr);
    this.api.reorderGalleries(arr.map((g) => g.id)).subscribe();
  }
}
