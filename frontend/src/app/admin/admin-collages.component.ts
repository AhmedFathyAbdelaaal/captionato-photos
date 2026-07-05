import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { Collage, CollageFormat, Photo } from '../models';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-admin-collages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top">
      <h1>Collages</h1>
      <div class="top-actions">
        <button class="btn-ghost" (click)="openAuto()">✦ Auto-chaotic</button>
        <button class="btn-accent" (click)="showNew.set(true)">+ New collage</button>
      </div>
    </header>
    <p class="err" *ngIf="error()">{{ error() }}</p>

    <!-- Draft gallery -->
    <div class="grid" *ngIf="collages().length; else empty">
      <div class="card" *ngFor="let c of collages()">
        <button class="preview" (click)="open(c)" [title]="'Open ' + c.format + ' collage'">
          <div
            class="mini"
            [class.story]="c.format === 'story'"
            [style.background]="c.background_color"
          >
            <img
              *ngFor="let l of c.layers"
              [src]="api.imageUrl(l.thumb_url)"
              [style.left.%]="l.pos_x * 100"
              [style.top.%]="l.pos_y * 100"
              [style.width.%]="l.width * 100"
              [style.height.%]="l.height * 100"
              [style.transform]="'rotate(' + l.rotation + 'deg)'"
              [style.zIndex]="l.z_index"
              alt=""
            />
          </div>
        </button>
        <div class="meta">
          <span class="badge" [class.exported]="c.status === 'exported'">
            {{ c.format }} · {{ c.status }}
          </span>
          <span class="muted small">
            {{ c.layer_count }} photos · {{ c.updated_at | date: 'MMM d, HH:mm' }}
          </span>
        </div>
        <button class="btn-ghost danger small" (click)="remove(c)">Delete</button>
      </div>
    </div>
    <ng-template #empty>
      <p class="muted" *ngIf="!loading()">
        No collages yet — start one with “New collage” or let “Auto-chaotic” scatter
        a few photos for you.
      </p>
    </ng-template>

    <!-- New collage: format picker -->
    <div class="overlay" *ngIf="showNew()" (click)="showNew.set(false)">
      <div class="modal" (click)="$event.stopPropagation()">
        <h2>New collage</h2>
        <p class="muted">Pick a format — it can't be changed later.</p>
        <div class="formats">
          <button class="format" (click)="create('post')">
            <span class="shape post"></span>
            <strong>Post</strong>
            <span class="muted small">1080 × 1080</span>
          </button>
          <button class="format" (click)="create('story')">
            <span class="shape story"></span>
            <strong>Story</strong>
            <span class="muted small">1080 × 1920</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Auto-chaotic modal -->
    <div class="overlay" *ngIf="showAuto()" (click)="cancelAuto()">
      <div class="modal wide" (click)="$event.stopPropagation()">
        <ng-container *ngIf="!options().length; else pickOption">
          <h2>Auto-chaotic collage</h2>
          <div class="auto-format">
            <label>
              <input type="radio" name="fmt" value="post" [(ngModel)]="autoFormat" />
              Post 1:1
            </label>
            <label>
              <input type="radio" name="fmt" value="story" [(ngModel)]="autoFormat" />
              Story 9:16
            </label>
            <span class="muted small sel-count">{{ selected.size }} selected</span>
          </div>
          <div class="photo-grid">
            <button
              class="ph"
              *ngFor="let p of photos()"
              [class.on]="selected.has(p.id)"
              (click)="toggle(p.id)"
            >
              <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.filename" loading="lazy" />
              <span class="check" *ngIf="selected.has(p.id)">✓</span>
            </button>
          </div>
          <div class="actions">
            <button class="btn-ghost" (click)="cancelAuto()">Cancel</button>
            <button
              class="btn-accent"
              [disabled]="selected.size < 2 || generating()"
              (click)="generate()"
            >
              {{ generating() ? 'Generating…' : 'Generate 3 options' }}
            </button>
          </div>
        </ng-container>

        <ng-template #pickOption>
          <h2>Pick an arrangement</h2>
          <div class="options">
            <button class="opt" *ngFor="let c of options(); let i = index" (click)="pick(c)">
              <div
                class="mini"
                [class.story]="c.format === 'story'"
                [style.background]="c.background_color"
              >
                <img
                  *ngFor="let l of c.layers"
                  [src]="api.imageUrl(l.thumb_url)"
                  [style.left.%]="l.pos_x * 100"
                  [style.top.%]="l.pos_y * 100"
                  [style.width.%]="l.width * 100"
                  [style.height.%]="l.height * 100"
                  [style.transform]="'rotate(' + l.rotation + 'deg)'"
                  [style.zIndex]="l.z_index"
                  alt=""
                />
              </div>
              <span>Option {{ i + 1 }}</span>
            </button>
          </div>
          <div class="actions">
            <button class="btn-ghost" (click)="regenerate()" [disabled]="generating()">
              {{ generating() ? 'Generating…' : '↻ Regenerate' }}
            </button>
            <button class="btn-ghost" (click)="cancelAuto()">Cancel</button>
          </div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [
    `
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.8rem;
        margin-bottom: 1.4rem;
      }
      .top-actions {
        display: flex;
        gap: 0.6rem;
      }
      .err {
        color: #c33;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 1rem;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.7rem;
        background: var(--color-surface);
      }
      .preview {
        border: 0;
        padding: 0;
        background: none;
        cursor: pointer;
        display: block;
      }
      .mini {
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        overflow: hidden;
        border-radius: calc(var(--radius) / 2);
      }
      .mini.story {
        aspect-ratio: 9 / 16;
      }
      .mini img {
        position: absolute;
        object-fit: cover;
        display: block;
      }
      .meta {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .badge {
        font-family: var(--font-display);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-accent);
      }
      .badge.exported {
        color: var(--color-muted);
      }
      .small {
        font-size: 0.8rem;
      }
      .muted {
        color: var(--color-muted);
      }
      .danger {
        color: #c33;
      }

      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        display: grid;
        place-items: center;
        z-index: 90;
        padding: 1rem;
      }
      .modal {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 1.4rem;
        width: min(440px, 100%);
        max-height: 90vh;
        overflow: auto;
      }
      .modal.wide {
        width: min(860px, 100%);
      }
      .modal h2 {
        margin: 0 0 0.4rem;
        font-family: var(--font-display);
      }
      .formats {
        display: flex;
        gap: 1rem;
        margin-top: 1rem;
      }
      .format {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1.1rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-paper);
        cursor: pointer;
      }
      .format:hover {
        border-color: var(--color-accent);
      }
      .shape {
        display: block;
        background: var(--color-border);
        border-radius: 3px;
      }
      .shape.post {
        width: 44px;
        height: 44px;
      }
      .shape.story {
        width: 28px;
        height: 50px;
      }

      .auto-format {
        display: flex;
        align-items: center;
        gap: 1.2rem;
        margin: 0.8rem 0;
      }
      .sel-count {
        margin-left: auto;
      }
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
        gap: 0.4rem;
        max-height: 45vh;
        overflow: auto;
      }
      .ph {
        position: relative;
        padding: 0;
        border: 2px solid transparent;
        border-radius: 4px;
        overflow: hidden;
        cursor: pointer;
        background: none;
        aspect-ratio: 1;
      }
      .ph img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .ph.on {
        border-color: var(--color-accent);
      }
      .check {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--color-accent);
        color: #fff;
        font-size: 0.75rem;
        display: grid;
        place-items: center;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        margin-top: 1rem;
      }
      .options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.8rem;
        margin-top: 1rem;
      }
      .opt {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.5rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-paper);
        cursor: pointer;
      }
      .opt:hover {
        border-color: var(--color-accent);
      }
      @media (max-width: 600px) {
        .options {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminCollagesComponent implements OnInit {
  collages = signal<Collage[]>([]);
  loading = signal(true);
  error = signal('');

  showNew = signal(false);

  // Auto-chaotic state
  showAuto = signal(false);
  photos = signal<Photo[]>([]);
  selected = new Set<string>();
  autoFormat: CollageFormat = 'post';
  generating = signal(false);
  options = signal<Collage[]>([]);

  constructor(public api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.getCollages().subscribe({
      next: (list) => {
        this.collages.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load collages.');
        this.loading.set(false);
      },
    });
  }

  create(format: CollageFormat): void {
    this.api.createCollage(format).subscribe({
      next: (c) => this.router.navigate(['/admin/collages', c.id]),
      error: () => this.error.set('Could not create collage.'),
    });
  }

  open(c: Collage): void {
    this.router.navigate(['/admin/collages', c.id]);
  }

  remove(c: Collage): void {
    if (!confirm('Delete this collage draft?')) return;
    this.api.deleteCollage(c.id).subscribe({
      next: () => this.collages.set(this.collages().filter((x) => x.id !== c.id)),
      error: () => this.error.set('Could not delete collage.'),
    });
  }

  // ── Auto-chaotic ──
  openAuto(): void {
    this.showAuto.set(true);
    this.selected.clear();
    this.options.set([]);
    if (!this.photos().length) {
      this.api.getAdminPhotos(1, 200).subscribe({
        next: (page) => this.photos.set(page.items),
        error: () => this.error.set('Could not load photos.'),
      });
    }
  }

  toggle(id: string): void {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
  }

  generate(): void {
    this.generating.set(true);
    // A regenerate discards the previous unpicked drafts first.
    this.discardOptions();
    this.api
      .generateAutoCollages(this.autoFormat, [...this.selected])
      .subscribe({
        next: (opts) => {
          this.options.set(opts);
          this.generating.set(false);
        },
        error: () => {
          this.error.set('Generation failed.');
          this.generating.set(false);
        },
      });
  }

  regenerate(): void {
    this.generate();
  }

  pick(chosen: Collage): void {
    const rest = this.options().filter((c) => c.id !== chosen.id);
    if (rest.length) {
      forkJoin(rest.map((c) => this.api.deleteCollage(c.id))).subscribe();
    }
    this.options.set([]);
    this.showAuto.set(false);
    this.router.navigate(['/admin/collages', chosen.id]);
  }

  cancelAuto(): void {
    this.discardOptions();
    this.showAuto.set(false);
  }

  private discardOptions(): void {
    const opts = this.options();
    if (opts.length) {
      forkJoin(opts.map((c) => this.api.deleteCollage(c.id))).subscribe();
      this.options.set([]);
    }
  }
}
