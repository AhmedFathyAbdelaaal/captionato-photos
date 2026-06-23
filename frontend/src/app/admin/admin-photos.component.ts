import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { Gallery, Photo } from '../models';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-admin-photos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top">
      <h1>Photos</h1>
      <span class="count mono">{{ total() }} total</span>
      <button
        class="btn-ghost sel-toggle"
        *ngIf="photos().length"
        (click)="toggleSelectAll()"
      >
        {{ allSelected() ? 'Deselect all' : 'Select all' }}
      </button>
    </header>

    <!-- Upload zone (big + thumb-friendly for mobile) -->
    <label
      class="drop"
      [class.over]="dragOver()"
      (dragover)="$event.preventDefault(); dragOver.set(true)"
      (dragleave)="dragOver.set(false)"
      (drop)="onDrop($event)"
    >
      <input type="file" multiple accept="image/*" (change)="onPick($event)" hidden />
      <span class="drop-icon">⬆</span>
      <ng-container *ngIf="!uploading()">
        <strong>Tap to add photos</strong>
        <span class="drop-sub">or drop them here · JPG, PNG, WEBP</span>
      </ng-container>
      <strong *ngIf="uploading()">Uploading {{ uploadCount() }}…</strong>
    </label>
    <p class="err" *ngIf="error()">{{ error() }}</p>

    <!-- Photo grid -->
    <div class="grid" [class.has-bar]="selected().size > 0">
      <article class="card" *ngFor="let p of photos()" [class.picked]="isSelected(p.id)">
        <div class="thumb" [class.hidden]="!p.visible">
          <img
            [src]="api.imageUrl(p.thumbnail_url)"
            [alt]="p.filename"
            loading="lazy"
            (click)="toggleSelect(p.id)"
          />
          <button class="check" (click)="toggleSelect(p.id)" [attr.aria-pressed]="isSelected(p.id)">
            {{ isSelected(p.id) ? '✓' : '' }}
          </button>
          <button
            class="vis"
            (click)="toggleVisible(p)"
            [title]="p.visible ? 'Visible on archive' : 'Hidden'"
          >
            {{ p.visible ? '👁' : '🚫' }}
          </button>
          <button class="edit" (click)="editing.set(editing() === p.id ? null : p.id)">⋯</button>
        </div>

        <!-- Inline single-photo editor -->
        <div class="editor" *ngIf="editing() === p.id">
          <label>Title<input [(ngModel)]="p.title" placeholder="Untitled" /></label>
          <label>Caption<textarea [(ngModel)]="p.caption" rows="2"></textarea></label>
          <fieldset>
            <legend>Galleries</legend>
            <label class="chk" *ngFor="let g of galleries()">
              <input
                type="checkbox"
                [checked]="inGallery(p, g.id)"
                (change)="toggleGallery(p, g.id, $event)"
              />
              {{ g.name }}
            </label>
            <p class="muted" *ngIf="galleries().length === 0">No galleries yet.</p>
          </fieldset>
          <div class="actions">
            <button class="btn-accent" (click)="save(p)">Save</button>
            <button class="btn-ghost danger" (click)="remove(p)">Delete</button>
          </div>
        </div>
      </article>
    </div>

    <p class="muted" *ngIf="!loading() && photos().length === 0">
      No photos yet — add some above.
    </p>

    <!-- Bulk action bar -->
    <div class="bulk-bar" *ngIf="selected().size > 0">
      <!-- Gallery picker popover -->
      <div class="picker" *ngIf="showPicker()">
        <p class="picker-head">Add {{ selected().size }} photo(s) to:</p>
        <div class="picker-list">
          <label class="chk" *ngFor="let g of galleries()">
            <input type="checkbox" [checked]="pickerSel().has(g.id)" (change)="togglePicker(g.id)" />
            {{ g.name }}
          </label>
          <p class="muted" *ngIf="galleries().length === 0">No galleries yet.</p>
        </div>
        <div class="picker-actions">
          <button class="btn-accent" [disabled]="pickerSel().size === 0 || busy()" (click)="applyGalleries()">
            Add
          </button>
          <button class="btn-ghost" (click)="showPicker.set(false)">Cancel</button>
        </div>
      </div>

      <span class="sel-count">{{ selected().size }} selected</span>
      <div class="bar-actions">
        <button class="btn-ghost" (click)="showPicker.set(!showPicker())">＋ Gallery</button>
        <button class="btn-ghost" (click)="bulkVisibility(false)">Hide</button>
        <button class="btn-ghost" (click)="bulkVisibility(true)">Show</button>
        <button class="btn-ghost danger" (click)="bulkDelete()">Delete</button>
        <button class="btn-ghost" (click)="clearSelection()">✕</button>
      </div>
    </div>
  `,
  styles: [
    `
      .top {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
        flex-wrap: wrap;
      }
      .count {
        color: var(--color-muted);
        font-size: 0.85rem;
      }
      .sel-toggle {
        margin-left: auto;
        padding: 0.35rem 0.7rem;
        font-size: 0.85rem;
      }
      .drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        padding: 2.2rem 1rem;
        margin: 1.2rem 0;
        border: 2px dashed var(--color-border);
        border-radius: var(--radius);
        color: var(--color-muted);
        cursor: pointer;
        text-align: center;
        transition: border-color 0.2s var(--ease), color 0.2s var(--ease);
      }
      .drop.over {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
      .drop strong {
        color: var(--color-ink);
        font-family: var(--font-display);
      }
      .drop-icon {
        font-size: 1.6rem;
        color: var(--color-accent);
      }
      .drop-sub {
        font-size: 0.8rem;
      }
      .err {
        color: var(--color-accent);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 0.8rem;
      }
      .grid.has-bar {
        padding-bottom: 5rem; /* clear the fixed bulk bar */
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        overflow: hidden;
        transition: box-shadow 0.15s var(--ease);
      }
      .card.picked {
        box-shadow: 0 0 0 3px var(--color-accent);
        border-color: var(--color-accent);
      }
      .thumb {
        position: relative;
        aspect-ratio: 1;
        background: var(--color-paper);
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        cursor: pointer;
      }
      .thumb.hidden img {
        opacity: 0.4;
      }
      .check,
      .vis,
      .edit {
        position: absolute;
        border: none;
        border-radius: 50%;
        width: 2.1rem;
        height: 2.1rem;
        background: color-mix(in srgb, var(--color-paper) 82%, transparent);
        backdrop-filter: blur(4px);
        display: grid;
        place-items: center;
        font-size: 0.95rem;
      }
      .check {
        top: 0.4rem;
        left: 0.4rem;
        color: var(--color-accent);
        font-weight: 700;
        border: 2px solid var(--color-border);
      }
      .card.picked .check {
        background: var(--color-accent);
        color: #fff;
        border-color: var(--color-accent);
      }
      .vis {
        bottom: 0.4rem;
        left: 0.4rem;
      }
      .edit {
        top: 0.4rem;
        right: 0.4rem;
        font-weight: 700;
      }
      .editor {
        padding: 0.8rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .editor label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.8rem;
        color: var(--color-muted);
      }
      input,
      textarea {
        font-family: var(--font-body);
        padding: 0.4rem 0.5rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      fieldset {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.8rem;
      }
      legend {
        color: var(--color-muted);
        padding: 0 0.3rem;
      }
      .chk {
        flex-direction: row !important;
        align-items: center;
        gap: 0.4rem !important;
        color: var(--color-ink) !important;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
      }
      .danger {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }
      .muted {
        color: var(--color-muted);
      }

      /* ── Bulk action bar ── */
      .bulk-bar {
        position: fixed;
        left: 230px;
        right: 0;
        bottom: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.7rem clamp(1rem, 3vw, 2rem);
        background: color-mix(in srgb, var(--color-surface) 92%, transparent);
        backdrop-filter: blur(10px);
        border-top: 1px solid var(--color-border);
      }
      .sel-count {
        font-family: var(--font-display);
        font-weight: 600;
      }
      .bar-actions {
        margin-left: auto;
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
      }
      .bar-actions .btn-ghost {
        padding: 0.45rem 0.7rem;
        font-size: 0.85rem;
      }
      .picker {
        position: absolute;
        bottom: calc(100% + 0.5rem);
        left: clamp(1rem, 3vw, 2rem);
        width: min(320px, 90vw);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.9rem;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      }
      .picker-head {
        margin: 0 0 0.5rem;
        font-size: 0.85rem;
        color: var(--color-muted);
      }
      .picker-list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        max-height: 40vh;
        overflow: auto;
        margin-bottom: 0.7rem;
      }
      .picker-actions {
        display: flex;
        gap: 0.5rem;
      }

      @media (max-width: 720px) {
        .bulk-bar {
          left: 0;
        }
      }
    `,
  ],
})
export class AdminPhotosComponent implements OnInit {
  photos = signal<Photo[]>([]);
  galleries = signal<Gallery[]>([]);
  total = signal(0);
  loading = signal(true);
  uploading = signal(false);
  uploadCount = signal(0);
  dragOver = signal(false);
  editing = signal<string | null>(null);
  error = signal('');

  // Bulk selection
  selected = signal<Set<string>>(new Set());
  showPicker = signal(false);
  pickerSel = signal<Set<string>>(new Set());
  busy = signal(false);

  allSelected = computed(
    () => this.photos().length > 0 && this.selected().size === this.photos().length,
  );

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    forkJoin({
      photos: this.api.getAdminPhotos(1, 200),
      galleries: this.api.getGalleries(),
    }).subscribe({
      next: ({ photos, galleries }) => {
        this.photos.set(photos.items);
        this.total.set(photos.total);
        this.galleries.set(galleries);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // ── Upload ──
  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.upload(Array.from(input.files));
    input.value = '';
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const files = e.dataTransfer?.files;
    if (files?.length) this.upload(Array.from(files));
  }

  private upload(files: File[]): void {
    this.uploading.set(true);
    this.uploadCount.set(files.length);
    this.error.set('');
    this.api.uploadPhotos(files).subscribe({
      next: (created) => {
        this.photos.update((cur) => [...created, ...cur]);
        this.total.update((t) => t + created.length);
        this.uploading.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.detail || 'Upload failed.');
        this.uploading.set(false);
      },
    });
  }

  // ── Selection ──
  isSelected(id: string): boolean {
    return this.selected().has(id);
  }
  toggleSelect(id: string): void {
    const next = new Set(this.selected());
    next.has(id) ? next.delete(id) : next.add(id);
    this.selected.set(next);
  }
  clearSelection(): void {
    this.selected.set(new Set());
    this.showPicker.set(false);
  }
  toggleSelectAll(): void {
    this.selected.set(
      this.allSelected() ? new Set() : new Set(this.photos().map((p) => p.id)),
    );
  }
  private selectedIds(): string[] {
    return Array.from(this.selected());
  }

  // ── Bulk actions ──
  bulkVisibility(visible: boolean): void {
    const ids = this.selectedIds();
    this.api.bulkSetVisibility(ids, visible).subscribe(() => {
      const set = new Set(ids);
      this.photos.update((cur) =>
        cur.map((p) => (set.has(p.id) ? { ...p, visible } : p)),
      );
    });
  }

  bulkDelete(): void {
    const ids = this.selectedIds();
    if (!confirm(`Delete ${ids.length} photo(s)? This cannot be undone.`)) return;
    this.api.bulkDelete(ids).subscribe(() => {
      const set = new Set(ids);
      this.photos.update((cur) => cur.filter((p) => !set.has(p.id)));
      this.total.update((t) => t - ids.length);
      this.clearSelection();
    });
  }

  togglePicker(gid: string): void {
    const next = new Set(this.pickerSel());
    next.has(gid) ? next.delete(gid) : next.add(gid);
    this.pickerSel.set(next);
  }

  applyGalleries(): void {
    const ids = this.selectedIds();
    const gids = Array.from(this.pickerSel());
    this.busy.set(true);
    this.api.bulkAddToGalleries(ids, gids).subscribe({
      next: () => {
        // Reflect new membership locally so the per-photo editor stays accurate.
        const sel = new Set(ids);
        this.photos.update((cur) =>
          cur.map((p) => {
            if (!sel.has(p.id)) return p;
            const merged = new Set([...(p.gallery_ids ?? []), ...gids]);
            return { ...p, gallery_ids: Array.from(merged) };
          }),
        );
        // Bump photo_count on affected galleries.
        this.galleries.update((cur) =>
          cur.map((g) =>
            gids.includes(g.id) ? { ...g, photo_count: g.photo_count } : g,
          ),
        );
        this.pickerSel.set(new Set());
        this.showPicker.set(false);
        this.busy.set(false);
      },
      error: () => {
        this.error.set('Could not add to galleries.');
        this.busy.set(false);
      },
    });
  }

  // ── Single-photo controls ──
  toggleVisible(p: Photo): void {
    const next = !p.visible;
    this.api.updatePhoto(p.id, { visible: next }).subscribe(() => (p.visible = next));
  }

  inGallery(p: Photo, gid: string): boolean {
    return (p.gallery_ids ?? []).includes(gid);
  }

  toggleGallery(p: Photo, gid: string, e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    const set = new Set(p.gallery_ids ?? []);
    checked ? set.add(gid) : set.delete(gid);
    p.gallery_ids = Array.from(set);
  }

  save(p: Photo): void {
    this.api
      .updatePhoto(p.id, {
        title: p.title ?? null,
        caption: p.caption ?? null,
        gallery_ids: p.gallery_ids ?? [],
      })
      .subscribe(() => this.editing.set(null));
  }

  remove(p: Photo): void {
    if (!confirm(`Delete "${p.title || p.filename}"? This cannot be undone.`)) return;
    this.api.deletePhoto(p.id).subscribe(() => {
      this.photos.update((cur) => cur.filter((x) => x.id !== p.id));
      this.total.update((t) => t - 1);
      this.editing.set(null);
    });
  }
}
