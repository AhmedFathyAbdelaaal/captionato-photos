import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Gallery, GalleryInput, GalleryVisibility } from '../models';
import { ApiService } from '../services/api.service';
import { PhotoComponent } from '../components/photo.component';

@Component({
  selector: 'app-admin-galleries',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PhotoComponent],
  template: `
    <header class="top">
      <h1>Galleries</h1>
      <span class="mono muted count" *ngIf="galleries().length">
        {{ galleries().length }} total · {{ privateCount() }} private
      </span>
    </header>

    <!-- Create -->
    <form class="create" (ngSubmit)="create()">
      <input
        [(ngModel)]="draft.name"
        name="name"
        placeholder="Gallery name"
        required
        (input)="autoSlug()"
      />
      <input
        [(ngModel)]="draft.slug"
        name="slug"
        placeholder="slug"
        required
      />
      <button class="btn-accent" type="submit" [disabled]="!draft.name || !draft.slug">
        Add
      </button>
    </form>
    <p class="err" *ngIf="error()">{{ error() }}</p>

    <!-- Toast -->
    <div class="toast" *ngIf="toast()" role="status">{{ toast() }}</div>

    <!-- Public section -->
    <section *ngIf="publicGalleries().length">
      <h2 class="sec">
        <span class="dot pub"></span> Public
        <span class="mono muted">·</span>
        <span class="mono muted">{{ publicGalleries().length }}</span>
      </h2>
      <ul class="list">
        <ng-container *ngFor="let g of publicGalleries(); let i = index; trackBy: trackId">
          <ng-container
            *ngTemplateOutlet="row; context: { g: g, i: publicIndex(i) }"
          ></ng-container>
        </ng-container>
      </ul>
    </section>

    <!-- Private section (unlisted + password) -->
    <section *ngIf="privateGalleries().length" class="private-band">
      <h2 class="sec private-head">
        <span class="dot priv"></span> Private
        <span class="mono muted">·</span>
        <span class="mono muted">{{ privateGalleries().length }}</span>
      </h2>
      <ul class="list">
        <ng-container *ngFor="let g of privateGalleries(); let i = index; trackBy: trackId">
          <ng-container
            *ngTemplateOutlet="row; context: { g: g, i: privateIndex(i) }"
          ></ng-container>
        </ng-container>
      </ul>
    </section>

    <!-- Empty state -->
    <div class="empty" *ngIf="!loading() && galleries().length === 0">
      <span class="empty-mark">◔</span>
      <p><strong>No galleries yet.</strong></p>
      <p class="muted">Give the first one a name above.</p>
    </div>

    <!-- Row template — reused for public + private sections -->
    <ng-template #row let-g="g" let-i="i">
      <li class="row">
        <a class="cover" [routerLink]="['/admin/galleries', g.id]" [title]="'Edit ' + g.name">
          <app-photo
            *ngIf="g.cover_thumbnail_url"
            [src]="api.imageUrl(g.cover_thumbnail_url)"
            [alt]="g.name"
            fit="cover"
          ></app-photo>
          <span class="no-cover" *ngIf="!g.cover_thumbnail_url">◔</span>
        </a>
        <div class="info">
          <a class="name-link" [routerLink]="['/admin/galleries', g.id]">
            <strong class="name">{{ g.name }}</strong>
          </a>
          <span class="mono muted meta">
            /{{ g.slug }} · {{ g.photo_count }} · {{ g.layout }}
          </span>
          <span class="chip" [attr.data-vis]="g.visibility">
            <span class="chip-glyph">{{ visGlyph(g.visibility) }}</span>
            {{ visLabel(g.visibility) }}
          </span>
        </div>
        <div class="ord">
          <button (click)="move(i, -1)" [disabled]="i === 0" title="Move up">↑</button>
          <button
            (click)="move(i, 1)"
            [disabled]="i === galleries().length - 1"
            title="Move down"
          >
            ↓
          </button>
        </div>
        <button
          class="share"
          *ngIf="g.visibility !== 'public'"
          (click)="copyShareLink(g)"
          [title]="'Copy link' + (g.visibility === 'password' ? ' (password required to view)' : '')"
        >
          🔗
        </button>
        <a class="btn-accent edit-link" [routerLink]="['/admin/galleries', g.id]">Edit</a>
      </li>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .top {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
      }
      .top .count {
        font-size: 0.78rem;
      }
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
      .toast {
        position: fixed;
        left: 50%;
        top: 1.2rem;
        transform: translateX(-50%);
        z-index: 100;
        font-family: var(--font-mono);
        font-size: 0.78rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--cap-cream-hi);
        background: var(--cap-ink);
        border: 1px solid var(--cap-brass);
        border-radius: 999px;
        padding: 0.55rem 1rem;
        box-shadow: 0 12px 28px -10px rgba(20, 17, 16, 0.55);
        animation: toast-in 0.25s var(--ease);
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translate(-50%, -6px);
        }
      }

      .sec {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 2rem 0 0.8rem;
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: -0.02em;
        font-size: 1rem;
      }
      .sec .dot {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: var(--cap-capy);
        display: inline-block;
      }
      .sec .dot.pub {
        background: var(--cap-ember);
      }
      .sec .dot.priv {
        background: var(--cap-brass);
      }
      .private-band {
        margin-top: 0.5rem;
      }
      .private-head {
        color: var(--color-muted);
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
        grid-template-columns: 56px 1fr auto auto auto;
        align-items: center;
        gap: 0.8rem;
        padding: 0.6rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        transition: border-color 0.25s var(--ease), transform 0.25s var(--ease);
      }
      .row.editing {
        border-color: var(--color-accent);
        transform: translateY(-1px);
      }
      .cover {
        display: block;
        width: 56px;
        height: 56px;
        border-radius: var(--radius);
        overflow: hidden;
        background: var(--color-paper);
      }
      .no-cover {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        font-family: var(--font-display);
        color: var(--cap-capy);
      }
      .info {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
      }
      .name-link {
        color: inherit;
      }
      .name-link:hover .name {
        color: var(--color-accent);
      }
      .name {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: -0.01em;
        transition: color 0.15s var(--ease);
      }
      .edit-link {
        text-decoration: none;
        display: inline-flex;
        align-items: center;
      }
      .meta {
        font-size: 0.75rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .muted {
        color: var(--color-muted);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        margin-top: 0.15rem;
        padding: 0.15rem 0.55rem;
        font-family: var(--font-mono);
        font-size: 0.7rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-radius: 999px;
        width: fit-content;
        background: var(--cap-cream-hi);
        color: var(--cap-ink-2);
        box-shadow: inset 0 0 0 1px var(--color-border);
      }
      [data-theme='dark'] .chip {
        background: color-mix(in srgb, var(--cap-ink) 60%, transparent);
        color: var(--cap-cream-hi);
      }
      .chip[data-vis='public'] {
        color: var(--cap-ember);
        box-shadow: inset 0 0 0 1px var(--cap-ember);
      }
      .chip[data-vis='unlisted'] {
        color: var(--cap-capy);
        box-shadow: inset 0 0 0 1px var(--cap-capy);
      }
      .chip[data-vis='password'] {
        color: var(--cap-brass-deep);
        box-shadow: inset 0 0 0 1px var(--cap-brass);
      }
      [data-theme='dark'] .chip[data-vis='password'] {
        color: var(--cap-brass-bright);
      }
      .chip-glyph {
        line-height: 1;
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
      .share {
        width: 2rem;
        height: 2rem;
        border: 1px solid var(--color-border);
        background: transparent;
        border-radius: var(--radius);
        color: var(--color-muted);
        cursor: pointer;
        transition: color 0.2s var(--ease), border-color 0.2s var(--ease);
      }
      .share:hover {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }

      /* ── Editor ── */
      .editor {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.7rem;
        padding-top: 0.8rem;
        margin-top: 0.4rem;
        border-top: 1px solid var(--color-border);
        animation: editor-in 0.3s var(--ease);
        overflow: hidden;
      }
      @keyframes editor-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
      }
      .span-2 {
        grid-column: 1 / -1;
      }
      .editor label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.78rem;
        color: var(--color-muted);
      }
      .actions {
        display: flex;
        gap: 0.5rem;
      }
      .danger {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }
      .small {
        padding: 0.35rem 0.7rem !important;
        font-size: 0.8rem;
      }

      /* ── Visibility picker ── */
      .vis-field {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .af-label {
        font-size: 0.78rem;
        color: var(--color-muted);
      }
      .vis-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.5rem;
      }
      .vis-opt {
        display: flex !important;
        flex-direction: row !important;
        align-items: center;
        gap: 0.55rem;
        padding: 0.6rem 0.8rem;
        background: var(--color-paper);
        border: 1.5px solid var(--color-border);
        border-radius: var(--radius);
        cursor: pointer;
        transition: border-color 0.2s var(--ease), transform 0.15s var(--ease);
      }
      .vis-opt:hover {
        border-color: var(--cap-capy);
      }
      .vis-opt.on {
        border-color: var(--color-accent);
        transform: translateY(-1px);
      }
      .vis-opt input {
        display: none;
      }
      .vis-opt .vg {
        font-size: 1rem;
        line-height: 1;
      }
      .vis-opt .vt {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
      }
      .vis-opt .vt b {
        color: var(--color-ink);
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .vis-opt .vt small {
        font-size: 0.72rem;
        color: var(--color-muted);
      }

      .pw-row {
        display: flex;
        align-items: flex-end;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .pw-row .pw {
        flex: 1 1 220px;
      }

      .share-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.55rem 0.7rem;
        background: var(--color-paper);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius);
        flex-wrap: wrap;
      }
      .share-row .link {
        flex: 1 1 auto;
        min-width: 0;
        font-family: var(--font-mono);
        font-size: 0.78rem;
        color: var(--color-ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ── Accent picker (unchanged from before but tightened) ── */
      .accent-field {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .swatch {
        position: relative;
        width: 2rem;
        height: 2rem;
        padding: 0;
        border-radius: 50%;
        border: 2px solid var(--color-border);
        cursor: pointer;
        display: grid;
        place-items: center;
        color: var(--cap-cream-hi);
      }
      .swatch.on {
        box-shadow: 0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-ink);
      }
      .swatch.none {
        background: var(--color-surface);
        color: var(--color-muted);
      }
      .swatch.custom {
        overflow: hidden;
        color: var(--color-muted);
        font-size: 1.1rem;
        line-height: 1;
      }
      .swatch.custom input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .accent-preview {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.6rem 0.8rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
      }
      .pa-title {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .pa-rule {
        width: 38px;
        height: 3px;
        border-radius: 2px;
        background: var(--pa);
      }
      .pa-btn {
        margin-left: auto;
        background: var(--pa);
        color: var(--cap-cream-hi);
        border: none;
        border-radius: var(--radius);
        padding: 0.3rem 0.7rem;
        font-size: 0.8rem;
      }

      /* ── Empty state ── */
      .empty {
        margin-top: 2.5rem;
        text-align: center;
        color: var(--color-muted);
        padding: 2rem;
        border: 1px dashed var(--color-border);
        border-radius: var(--radius);
      }
      .empty-mark {
        display: block;
        font-family: var(--font-display);
        font-size: 2.4rem;
        color: var(--cap-capy);
        margin-bottom: 0.4rem;
      }
      .empty strong {
        color: var(--color-ink);
      }

      @media (max-width: 640px) {
        .row {
          grid-template-columns: 48px 1fr auto auto;
        }
        .ord {
          grid-row: 2;
          grid-column: 1 / -1;
          justify-content: flex-end;
        }
        .create input {
          flex: 1 1 100%;
        }
        .editor {
          grid-template-columns: 1fr;
        }
        .span-2 {
          grid-column: 1;
        }
      }
    `,
  ],
})
export class AdminGalleriesComponent implements OnInit {
  galleries = signal<Gallery[]>([]);
  loading = signal(true);
  error = signal('');
  toast = signal('');
  draft: GalleryInput = { name: '', slug: '' };

  publicGalleries = computed(() =>
    this.galleries().filter((g) => g.visibility === 'public'),
  );
  privateGalleries = computed(() =>
    this.galleries().filter((g) => g.visibility !== 'public'),
  );
  privateCount = computed(() => this.privateGalleries().length);

  trackId = (_: number, g: Gallery) => g.id;

  constructor(public api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getAdminGalleries().subscribe({
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
      // Jump straight into the new gallery's edit page to add photos.
      next: (g) => {
        this.draft = { name: '', slug: '' };
        this.router.navigate(['/admin/galleries', g.id]);
      },
      error: (e) => this.error.set(e.error?.detail || 'Could not create gallery.'),
    });
  }

  /** Move a gallery relative to its INDEX IN THE FULL LIST (not per-section). */
  move(index: number, dir: -1 | 1): void {
    const arr = [...this.galleries()];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    this.galleries.set(arr);
    this.api.reorderGalleries(arr.map((g) => g.id)).subscribe();
  }

  // Section-to-global index bridges: the row template gets a *global* index so
  // its up/down arrows still reorder against the full list.
  publicIndex(i: number): number {
    return this.galleries().indexOf(this.publicGalleries()[i]);
  }
  privateIndex(i: number): number {
    return this.galleries().indexOf(this.privateGalleries()[i]);
  }

  // ── Visibility helpers ──
  visLabel(v: GalleryVisibility): string {
    return { public: 'Public', unlisted: 'Unlisted', password: 'Password' }[v];
  }
  visGlyph(v: GalleryVisibility): string {
    return { public: '●', unlisted: '🔗', password: '🔒' }[v];
  }

  shareLink(g: Gallery): string {
    return `${window.location.origin}/galleries/${g.slug}`;
  }

  copyShareLink(g: Gallery): void {
    const link = this.shareLink(g);
    navigator.clipboard?.writeText(link).then(
      () => this.showToast('Share link copied'),
      () => this.showToast('Copy failed — select the link manually'),
    );
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => {
      if (this.toast() === msg) this.toast.set('');
    }, 2400);
  }
}
