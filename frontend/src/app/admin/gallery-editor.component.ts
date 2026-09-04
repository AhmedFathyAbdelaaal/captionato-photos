import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  ForceTheme,
  Gallery,
  GalleryDetail,
  GalleryLayout,
  GalleryVisibility,
  Photo,
} from '../models';
import { ApiService } from '../services/api.service';
import { PhotoComponent } from '../components/photo.component';

const LAYOUTS: GalleryLayout[] = [
  'masonry',
  'grid',
  'editorial',
  'slideshow',
  'moodboard',
  'collage',
  'polaroid',
  'filmstrip',
  'marquee',
];
const THEMES: ForceTheme[] = ['system', 'light', 'dark'];
const VISIBILITIES: { value: GalleryVisibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Public', hint: 'Listed on Galleries page' },
  { value: 'unlisted', label: 'Unlisted', hint: 'Hidden — link only' },
  { value: 'password', label: 'Password', hint: 'Requires a password to view' },
];

/**
 * Full-page gallery editor: all settings on the left, the gallery's photos on
 * the right with drag-reorder + per-photo actions, and a slide-in library
 * drawer to add more photos from the whole archive.
 */
@Component({
  selector: 'app-gallery-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PhotoComponent],
  template: `
    <div class="page" *ngIf="gallery() as g">
      <!-- Top bar -->
      <header class="bar">
        <a class="back" routerLink="/admin/galleries" title="Back to galleries">←</a>
        <div class="titles">
          <h1>{{ g.name }}</h1>
          <span class="chip" [attr.data-vis]="g.visibility">
            {{ visGlyph(g.visibility) }} {{ visLabel(g.visibility) }}
          </span>
        </div>
        <span class="save mono" [attr.data-state]="saveState()">{{ saveLabel() }}</span>
        <button class="btn-accent add-btn" (click)="openLibrary()">＋ Add photos</button>
      </header>

      <div class="err" *ngIf="error()">{{ error() }}</div>

      <div class="cols">
        <!-- ── Settings ── -->
        <section class="settings card">
          <h2>Settings</h2>
          <label>Name<input [(ngModel)]="g.name" name="name" /></label>
          <label>Slug<input [(ngModel)]="g.slug" name="slug" /></label>
          <label>Description
            <textarea [(ngModel)]="g.description" rows="3" name="desc"></textarea>
          </label>
          <div class="two">
            <label>Layout
              <select [(ngModel)]="g.layout" name="layout">
                <option *ngFor="let l of layouts" [value]="l">{{ l }}</option>
              </select>
            </label>
            <label>Theme
              <select [(ngModel)]="g.force_theme" name="theme">
                <option *ngFor="let t of themes" [value]="t">{{ t }}</option>
              </select>
            </label>
          </div>

          <!-- Visibility -->
          <span class="lbl">Who can see this?</span>
          <div class="vis-row">
            <label
              class="vis-opt"
              *ngFor="let v of visibilities"
              [class.on]="g.visibility === v.value"
            >
              <input type="radio" name="vis" [value]="v.value" [(ngModel)]="g.visibility" />
              <span class="vg">{{ visGlyph(v.value) }}</span>
              <span class="vt"><b>{{ v.label }}</b><small>{{ v.hint }}</small></span>
            </label>
          </div>
          <div class="pw-row" *ngIf="g.visibility === 'password'">
            <label class="grow">
              {{ g.has_password && !password ? 'Change password (blank keeps current)' : 'Password' }}
              <input
                type="text"
                [(ngModel)]="password"
                name="pw"
                autocomplete="off"
                [placeholder]="g.has_password ? '••••••••' : 'Choose a password'"
              />
            </label>
            <button
              type="button"
              class="btn-ghost small"
              *ngIf="g.has_password"
              (click)="password = ''; clearPw = true"
              title="Remove password on save"
            >
              Clear
            </button>
          </div>
          <div class="share-row" *ngIf="g.visibility !== 'public'">
            <code class="link">{{ shareLink(g) }}</code>
            <button type="button" class="btn-ghost small" (click)="copyShareLink(g)">Copy</button>
          </div>

          <!-- Accent -->
          <span class="lbl">Accent color</span>
          <div class="swatches">
            <button type="button" class="swatch none" [class.on]="!g.accent_color"
              (click)="g.accent_color = null" title="Default (Ember)">✕</button>
            <button type="button" class="swatch" *ngFor="let c of presets"
              [style.background]="c" [class.on]="g.accent_color === c"
              (click)="g.accent_color = c" [title]="c"></button>
            <label class="swatch custom" [class.on]="isCustom(g.accent_color)"
              [style.background]="isCustom(g.accent_color) ? g.accent_color : 'transparent'">
              <input type="color" [ngModel]="g.accent_color || '#d6362b'"
                (ngModelChange)="g.accent_color = $event" name="accent" />
              <span *ngIf="!isCustom(g.accent_color)">+</span>
            </label>
          </div>

          <div class="actions">
            <button class="btn-accent" (click)="saveSettings()" [disabled]="busy()">
              {{ busy() ? 'Saving…' : 'Save settings' }}
            </button>
            <button class="btn-ghost danger" (click)="deleteGallery()">Delete gallery</button>
          </div>
        </section>

        <!-- ── Photos in gallery ── -->
        <section class="photos card">
          <div class="ph-head">
            <h2>Photos <span class="mono muted">{{ g.photos.length }}</span></h2>
            <span class="muted small" *ngIf="g.photos.length">Drag to reorder · ★ sets cover</span>
          </div>

          <div class="pgrid" *ngIf="g.photos.length; else emptyPhotos">
            <figure
              class="pcell"
              *ngFor="let p of g.photos; let i = index"
              draggable="true"
              [class.dragging]="dragIndex() === i"
              (dragstart)="onDragStart(i)"
              (dragover)="onDragOver($event, i)"
              (drop)="onDrop()"
              (dragend)="onDragEnd()"
            >
              <app-photo [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" fit="cover"></app-photo>
              <button
                class="mini cover"
                [class.on]="g.cover_photo_id === p.id"
                (click)="setCover(g, p)"
                [title]="g.cover_photo_id === p.id ? 'Cover photo' : 'Set as cover'"
              >★</button>
              <button class="mini remove" (click)="removeFromGallery(p)" title="Remove from gallery (stays in library)">–</button>
              <button class="mini trash" (click)="rootDelete(p)" title="Delete from library entirely">🗑</button>
            </figure>
          </div>
          <ng-template #emptyPhotos>
            <div class="empty">
              <p><strong>No photos in this gallery yet.</strong></p>
              <button class="btn-accent" (click)="openLibrary()">＋ Add from library</button>
            </div>
          </ng-template>
        </section>
      </div>
    </div>

    <p class="hint" *ngIf="loading()">loading…</p>
    <p class="hint" *ngIf="notFound()">Gallery not found. <a routerLink="/admin/galleries">Back</a></p>

    <!-- ── Library drawer ── -->
    <div class="drawer-backdrop" *ngIf="libraryOpen()" (click)="libraryOpen.set(false)"></div>
    <aside class="drawer" [class.open]="libraryOpen()">
      <div class="drawer-head">
        <strong>Add from library</strong>
        <button class="btn-ghost" (click)="libraryOpen.set(false)">✕</button>
      </div>
      <div class="drawer-tools">
        <select [(ngModel)]="libraryTag" (ngModelChange)="reloadLibrary()" name="libtag">
          <option value="">All tags</option>
          <option *ngFor="let t of tags()" [value]="t">{{ t }}</option>
        </select>
        <span class="muted small">Click a photo to add · already-in shown ✓</span>
      </div>
      <div class="lib-grid" #libGrid (scroll)="onLibScroll($event)">
        <button
          class="lib"
          *ngFor="let p of library()"
          [class.member]="memberIds().has(p.id)"
          (click)="toggleMember(p)"
          [title]="p.filename"
        >
          <app-photo [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.filename" fit="cover"></app-photo>
          <span class="tick" *ngIf="memberIds().has(p.id)">✓</span>
        </button>
        <p class="muted small load" *ngIf="libraryLoading()">loading…</p>
        <p class="muted small load" *ngIf="libraryDone() && library().length === 0">No photos.</p>
      </div>
    </aside>
  `,
  styles: [
    `
      :host { display: block; }
      .page { max-width: 1200px; margin: 0 auto; }
      .bar {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        margin-bottom: 1.2rem;
      }
      .back {
        font-size: 1.3rem;
        width: 2.2rem; height: 2.2rem;
        display: grid; place-items: center;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      .titles { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
      .titles h1 {
        font-family: var(--font-display);
        font-weight: 800; letter-spacing: -0.03em;
        font-size: clamp(1.3rem, 3vw, 1.9rem);
        margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .save {
        margin-left: auto;
        font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--color-muted);
      }
      .save[data-state='saving'] { color: var(--cap-brass-deep); }
      .save[data-state='saved'] { color: var(--cap-capy); }
      .save[data-state='error'] { color: var(--color-accent); }
      .add-btn { white-space: nowrap; }

      .chip {
        display: inline-flex; align-items: center; gap: 0.3rem;
        padding: 0.15rem 0.55rem;
        font-family: var(--font-mono); font-size: 0.7rem;
        letter-spacing: 0.08em; text-transform: uppercase;
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px var(--color-border);
      }
      .chip[data-vis='public'] { color: var(--cap-ember); box-shadow: inset 0 0 0 1px var(--cap-ember); }
      .chip[data-vis='unlisted'] { color: var(--cap-capy); box-shadow: inset 0 0 0 1px var(--cap-capy); }
      .chip[data-vis='password'] { color: var(--cap-brass-deep); box-shadow: inset 0 0 0 1px var(--cap-brass); }

      .err { color: var(--color-accent); margin-bottom: 0.8rem; }

      .cols {
        display: grid;
        grid-template-columns: minmax(280px, 360px) 1fr;
        gap: 1.2rem;
        align-items: start;
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: calc(var(--radius) * 2);
        padding: 1.1rem;
      }
      .card h2 {
        font-family: var(--font-display);
        font-weight: 700; letter-spacing: -0.02em;
        font-size: 1.05rem; margin: 0 0 0.8rem;
      }
      .settings label {
        display: flex; flex-direction: column; gap: 0.25rem;
        font-size: 0.78rem; color: var(--color-muted);
        margin-bottom: 0.7rem;
      }
      .settings .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
      input, textarea, select {
        font-family: var(--font-body);
        padding: 0.5rem 0.6rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      .lbl { display: block; font-size: 0.78rem; color: var(--color-muted); margin: 0.4rem 0 0.5rem; }
      .vis-row { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.7rem; }
      .vis-opt {
        display: flex !important; flex-direction: row !important; align-items: center; gap: 0.5rem;
        padding: 0.5rem 0.7rem; margin: 0 !important;
        background: var(--color-paper); border: 1.5px solid var(--color-border);
        border-radius: var(--radius); cursor: pointer;
      }
      .vis-opt.on { border-color: var(--color-accent); }
      .vis-opt input { display: none; }
      .vis-opt .vg { font-size: 1rem; }
      .vis-opt .vt { display: flex; flex-direction: column; line-height: 1.2; }
      .vis-opt .vt b { color: var(--color-ink); font-family: var(--font-display); font-weight: 700; }
      .vis-opt .vt small { font-size: 0.7rem; color: var(--color-muted); }
      .pw-row { display: flex; align-items: flex-end; gap: 0.5rem; margin-bottom: 0.7rem; }
      .pw-row .grow { flex: 1; margin: 0; }
      .share-row {
        display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.7rem;
        padding: 0.5rem 0.6rem; border: 1px dashed var(--color-border); border-radius: var(--radius);
      }
      .share-row .link {
        flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 0.75rem;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .small { font-size: 0.8rem; }
      .swatches { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.9rem; }
      .swatch {
        position: relative; width: 1.9rem; height: 1.9rem; padding: 0;
        border-radius: 50%; border: 2px solid var(--color-border); cursor: pointer;
        display: grid; place-items: center; color: var(--cap-cream-hi);
      }
      .swatch.on { box-shadow: 0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-ink); }
      .swatch.none { background: var(--color-surface); color: var(--color-muted); }
      .swatch.custom { overflow: hidden; color: var(--color-muted); }
      .swatch.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .danger { color: var(--color-accent); border-color: var(--color-accent); }
      .btn-ghost.small { padding: 0.35rem 0.7rem; font-size: 0.8rem; }

      /* Photos grid */
      .ph-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.8rem; }
      .ph-head h2 { margin: 0; }
      .muted { color: var(--color-muted); }
      .pgrid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 0.7rem;
      }
      .pcell {
        position: relative; margin: 0;
        aspect-ratio: 1;
        border-radius: var(--radius);
        cursor: grab;
        --photo-radius: var(--radius);
      }
      .pcell.dragging { opacity: 0.4; }
      .pcell:active { cursor: grabbing; }
      .mini {
        position: absolute;
        width: 1.7rem; height: 1.7rem;
        border: none; border-radius: 50%;
        display: grid; place-items: center;
        font-size: 0.85rem; cursor: pointer;
        background: color-mix(in srgb, var(--cap-ink) 68%, transparent);
        color: var(--cap-cream-hi);
        opacity: 0; transition: opacity 0.15s var(--ease);
      }
      .pcell:hover .mini { opacity: 1; }
      .mini.cover { top: 0.3rem; left: 0.3rem; }
      .mini.cover.on { opacity: 1; background: var(--cap-brass); color: var(--cap-ink); }
      .mini.remove { top: 0.3rem; right: 0.3rem; font-weight: 700; }
      .mini.trash { bottom: 0.3rem; right: 0.3rem; }
      .mini.trash:hover { background: var(--cap-ember); }

      .empty { text-align: center; padding: 2rem; color: var(--color-muted); }
      .empty strong { color: var(--color-ink); display: block; margin-bottom: 0.8rem; }

      /* Library drawer */
      .drawer-backdrop {
        position: fixed; inset: 0; z-index: 190;
        background: color-mix(in srgb, var(--cap-ink) 40%, transparent);
      }
      .drawer {
        position: fixed; top: 0; right: 0; bottom: 0; z-index: 200;
        width: min(440px, 92vw);
        display: flex; flex-direction: column;
        background: var(--color-surface);
        border-left: 1.5px solid var(--color-border);
        box-shadow: -20px 0 60px -30px rgba(20, 17, 16, 0.6);
        transform: translateX(100%);
        transition: transform 0.28s var(--ease);
      }
      .drawer.open { transform: none; }
      .drawer-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem; border-bottom: 1px solid var(--color-border);
      }
      .drawer-head strong { font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; }
      .drawer-tools {
        display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
        padding: 0.8rem 1rem;
      }
      .lib-grid {
        flex: 1; overflow-y: auto;
        display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
        gap: 0.5rem; padding: 0 1rem 1rem; align-content: start;
      }
      .lib {
        position: relative; padding: 0; border: 2px solid transparent;
        border-radius: var(--radius); cursor: pointer; background: none;
        aspect-ratio: 1; --photo-radius: calc(var(--radius) - 2px);
      }
      .lib.member { border-color: var(--cap-ember); }
      .lib .tick {
        position: absolute; top: 0.25rem; right: 0.25rem;
        width: 1.3rem; height: 1.3rem; border-radius: 50%;
        background: var(--cap-ember); color: var(--cap-cream-hi);
        display: grid; place-items: center; font-size: 0.75rem; font-weight: 700;
      }
      .load { grid-column: 1 / -1; text-align: center; padding: 0.6rem; }

      .hint { text-align: center; color: var(--color-muted); font-family: var(--font-mono); padding: 3rem; }

      @media (max-width: 820px) {
        .cols { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class GalleryEditorComponent implements OnInit {
  gallery = signal<GalleryDetail | null>(null);
  loading = signal(true);
  notFound = signal(false);
  busy = signal(false);
  error = signal('');
  saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Settings password state (mirrors admin-galleries semantics).
  password = '';
  clearPw = false;

  // Library drawer
  libraryOpen = signal(false);
  library = signal<Photo[]>([]);
  libraryLoading = signal(false);
  libraryDone = signal(false);
  libraryTag = '';
  tags = signal<string[]>([]);
  private libPage = 1;
  private readonly libPageSize = 40;
  private libSeen = new Set<string>();

  // Drag reorder
  dragIndex = signal<number | null>(null);

  layouts = LAYOUTS;
  themes = THEMES;
  visibilities = VISIBILITIES;
  presets = [
    '#E0901E', '#1FA6A6', '#6C5CE7', '#2E7D5B',
    '#3A6EA5', '#C9A227', '#B5179E', '#5A5A52',
  ];

  memberIds = computed(
    () => new Set((this.gallery()?.photos ?? []).map((p) => p.id)),
  );

  constructor(
    public api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getAdminGallery(id).subscribe({
      next: (g) => {
        this.gallery.set(g);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
    this.api.getPhotoTags().subscribe({ next: (t) => this.tags.set(t) });
  }

  saveLabel(): string {
    return {
      idle: '', saving: 'saving…', saved: 'saved', error: 'save failed',
    }[this.saveState()];
  }

  isCustom(c: string | null | undefined): boolean {
    return !!c && c !== '#d6362b' && !this.presets.includes(c);
  }

  // ── Settings ──
  saveSettings(): void {
    const g = this.gallery();
    if (!g) return;
    this.busy.set(true);
    this.error.set('');
    // password: only send when typed, or when explicitly cleared.
    const pwPatch =
      this.password ? { password: this.password }
      : this.clearPw ? { password: '' }
      : {};
    this.api
      .updateGallery(g.id, {
        name: g.name,
        slug: g.slug,
        description: g.description,
        layout: g.layout,
        force_theme: g.force_theme,
        accent_color: g.accent_color,
        visibility: g.visibility,
        cover_photo_id: g.cover_photo_id,
        ...pwPatch,
      })
      .subscribe({
        next: (fresh) => {
          // Keep the photos we already have; merge fresh settings.
          this.gallery.update((cur) =>
            cur ? { ...cur, ...fresh, photos: cur.photos } : cur,
          );
          this.password = '';
          this.clearPw = false;
          this.busy.set(false);
          this.flashSaved();
        },
        error: (e) => {
          this.error.set(e.error?.detail || 'Save failed.');
          this.busy.set(false);
        },
      });
  }

  deleteGallery(): void {
    const g = this.gallery();
    if (!g) return;
    if (!confirm(`Delete gallery "${g.name}"? Photos stay in the library.`)) return;
    this.api.deleteGallery(g.id).subscribe(() =>
      this.router.navigate(['/admin/galleries']),
    );
  }

  setCover(g: GalleryDetail, p: Photo): void {
    const next = g.cover_photo_id === p.id ? null : p.id;
    this.gallery.update((cur) => (cur ? { ...cur, cover_photo_id: next } : cur));
    this.api.updateGallery(g.id, { cover_photo_id: next }).subscribe({
      next: () => this.flashSaved(),
      error: () => this.error.set('Could not set cover.'),
    });
  }

  // ── Photo membership ──
  removeFromGallery(p: Photo): void {
    const g = this.gallery();
    if (!g) return;
    this.api.removePhotoFromGallery(g.id, p.id).subscribe({
      next: () => this.dropPhotoLocally(p.id),
      error: () => this.error.set('Could not remove photo.'),
    });
  }

  rootDelete(p: Photo): void {
    if (!confirm(`Delete "${p.title || p.filename}" from the whole library? This cannot be undone.`)) return;
    this.api.deletePhoto(p.id).subscribe({
      next: () => {
        this.dropPhotoLocally(p.id);
        // Also drop from the library drawer if present.
        this.library.update((cur) => cur.filter((x) => x.id !== p.id));
        this.libSeen.delete(p.id);
      },
      error: () => this.error.set('Could not delete photo.'),
    });
  }

  private dropPhotoLocally(pid: string): void {
    this.gallery.update((cur) =>
      cur
        ? {
            ...cur,
            photos: cur.photos.filter((x) => x.id !== pid),
            cover_photo_id: cur.cover_photo_id === pid ? null : cur.cover_photo_id,
          }
        : cur,
    );
  }

  // ── Drag reorder ──
  onDragStart(i: number): void {
    this.dragIndex.set(i);
  }
  onDragOver(e: DragEvent, i: number): void {
    e.preventDefault();
    const from = this.dragIndex();
    if (from === null || from === i) return;
    this.gallery.update((cur) => {
      if (!cur) return cur;
      const photos = [...cur.photos];
      const [moved] = photos.splice(from, 1);
      photos.splice(i, 0, moved);
      return { ...cur, photos };
    });
    this.dragIndex.set(i);
  }
  onDrop(): void {
    this.persistOrder();
  }
  onDragEnd(): void {
    if (this.dragIndex() !== null) this.persistOrder();
    this.dragIndex.set(null);
  }
  private persistOrder(): void {
    const g = this.gallery();
    if (!g) return;
    this.api
      .reorderGalleryPhotos(g.id, g.photos.map((p) => p.id))
      .subscribe({ next: () => this.flashSaved() });
  }

  // ── Library drawer ──
  openLibrary(): void {
    this.libraryOpen.set(true);
    if (this.library().length === 0) this.reloadLibrary();
  }
  reloadLibrary(): void {
    this.library.set([]);
    this.libSeen.clear();
    this.libPage = 1;
    this.libraryDone.set(false);
    this.loadLibraryPage();
  }
  private loadLibraryPage(): void {
    if (this.libraryLoading() || this.libraryDone()) return;
    this.libraryLoading.set(true);
    this.api
      .getAdminPhotos(this.libPage, this.libPageSize, 'taken', this.libraryTag || undefined)
      .subscribe({
        next: (res) => {
          const fresh = res.items.filter((p) => !this.libSeen.has(p.id));
          fresh.forEach((p) => this.libSeen.add(p.id));
          this.library.update((cur) => [...cur, ...fresh]);
          this.libPage += 1;
          if (this.library().length >= res.total || res.items.length === 0) {
            this.libraryDone.set(true);
          }
          this.libraryLoading.set(false);
        },
        error: () => this.libraryLoading.set(false),
      });
  }
  onLibScroll(e: Event): void {
    const el = e.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      this.loadLibraryPage();
    }
  }

  /** Click a library photo: add to gallery if not a member, else remove. */
  toggleMember(p: Photo): void {
    const g = this.gallery();
    if (!g) return;
    if (this.memberIds().has(p.id)) {
      this.api.removePhotoFromGallery(g.id, p.id).subscribe({
        next: () => this.dropPhotoLocally(p.id),
      });
    } else {
      this.api.bulkAddToGalleries([p.id], [g.id]).subscribe({
        next: () => {
          // Appended to the gallery's end server-side; mirror that locally.
          this.gallery.update((cur) =>
            cur ? { ...cur, photos: [...cur.photos, p] } : cur,
          );
          this.flashSaved();
        },
      });
    }
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
    navigator.clipboard?.writeText(this.shareLink(g)).then(() => this.flashSaved('link copied'));
  }

  private flashSaved(label = 'saved'): void {
    this.saveState.set(label === 'saved' ? 'saved' : 'idle');
    if (label === 'saved') {
      setTimeout(() => {
        if (this.saveState() === 'saved') this.saveState.set('idle');
      }, 1800);
    }
  }
}
