import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FEATURED_TAG, Gallery, Photo } from '../models';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-admin-photos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top">
      <h1>Photos</h1>
      <span class="count mono">{{ total() }} total</span>
      <div class="sorter" title="Sort by capture date (EXIF) or upload date">
        <span class="sort-lbl">sort</span>
        <button [class.on]="sortMode() === 'taken'" (click)="setSort('taken')">Taken</button>
        <button [class.on]="sortMode() === 'uploaded'" (click)="setSort('uploaded')">Uploaded</button>
      </div>
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

    <!-- Sticky date indicator — how far back you've scrolled -->
    <div class="date-pill" *ngIf="currentLabel()">
      <strong>{{ currentLabel() }}</strong>
      <span>{{ currentBack() }}</span>
    </div>

    <!-- Photo grid -->
    <div class="grid" [class.has-bar]="selected().size > 0" #grid>
      <ng-container *ngFor="let p of photos(); let i = index">
        <div
          class="month-sep"
          *ngIf="monthChanged(i)"
          [attr.data-label]="shortMonth(p)"
          [attr.data-back]="monthBack(p)"
        >
          {{ monthLabel(p) }}
        </div>
        <article class="card" [class.picked]="isSelected(p.id)">
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
          <button
            class="star"
            [class.on]="isFeatured(p)"
            (click)="toggleFeatured(p)"
            [title]="isFeatured(p) ? 'Featured on homepage' : 'Feature on homepage'"
          >
            {{ isFeatured(p) ? '★' : '☆' }}
          </button>
          <button class="edit" (click)="editing.set(editing() === p.id ? null : p.id)">⋯</button>
        </div>

        <!-- Inline single-photo editor -->
        <div class="editor" *ngIf="editing() === p.id">
          <label>Title<input [(ngModel)]="p.title" placeholder="Untitled" /></label>
          <label>Caption<textarea [(ngModel)]="p.caption" rows="2"></textarea></label>
          <fieldset>
            <legend>Tags</legend>
            <div class="tag-chips">
              <span class="tag-chip" *ngFor="let t of p.tags">
                {{ t }}
                <button type="button" (click)="removeTag(p, t)" title="Remove tag">✕</button>
              </span>
              <input
                class="tag-add"
                [(ngModel)]="tagDraft[p.id]"
                placeholder="add tag…"
                (keydown.enter)="addTag(p, tagDraft[p.id]); $event.preventDefault()"
                [attr.list]="'taglist'"
              />
            </div>
          </fieldset>
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
      </ng-container>

      <!-- Skeleton shimmer cards while the next batch loads -->
      <article class="card skel" *ngFor="let s of skeletons()"></article>
    </div>

    <p class="end-hint muted" *ngIf="allLoaded() && photos().length > 0">
      That's all {{ total() }} photos.
    </p>

    <p class="muted" *ngIf="!loading() && photos().length === 0">
      No photos yet — add some above.
    </p>

    <!-- Shared tag suggestions for the tag inputs -->
    <datalist id="taglist">
      <option *ngFor="let t of allTags()" [value]="t"></option>
    </datalist>

    <!-- Bulk action bar -->
    <div class="bulk-bar" *ngIf="selected().size > 0">
      <span class="sel-count">{{ selected().size }} selected</span>
      <div class="bar-actions">
        <button class="btn-ghost" (click)="openPicker()">＋ Gallery</button>
        <button class="btn-ghost" (click)="bulkFeature(true)" title="Add to homepage">★ Feature</button>
        <button class="btn-ghost" (click)="bulkFeature(false)" title="Remove from homepage">☆ Unfeature</button>
        <form class="bulk-tag" (ngSubmit)="bulkAddTag()">
          <input
            [(ngModel)]="bulkTagDraft"
            name="bulkTag"
            placeholder="tag…"
            list="taglist"
            autocomplete="off"
          />
          <button class="btn-ghost" type="submit" [disabled]="!bulkTagDraft.trim()">Tag</button>
        </form>
        <button class="btn-ghost" (click)="bulkVisibility(false)">Hide</button>
        <button class="btn-ghost" (click)="bulkVisibility(true)">Show</button>
        <button class="btn-ghost danger" (click)="bulkDelete()">Delete</button>
        <button class="btn-ghost" (click)="clearSelection()">✕</button>
      </div>
    </div>

    <!-- Gallery picker modal -->
    <div
      class="modal-backdrop"
      *ngIf="showPicker()"
      (click)="closePicker()"
      role="dialog"
      aria-modal="true"
    >
      <div class="modal" (click)="$event.stopPropagation()">
        <header class="modal-head">
          <h2>Add to galleries</h2>
          <p class="mono muted">
            {{ selected().size }} photo{{ selected().size === 1 ? '' : 's' }} · pick one or more
          </p>
        </header>

        <div class="chips" *ngIf="galleries().length">
          <button
            type="button"
            class="chip"
            *ngFor="let g of galleries()"
            [class.on]="pickerSel().has(g.id)"
            (click)="togglePicker(g.id)"
          >
            <span class="chip-vis" *ngIf="g.visibility !== 'public'">
              {{ g.visibility === 'password' ? '🔒' : '🔗' }}
            </span>
            <span class="chip-name">{{ g.name }}</span>
            <span class="chip-count mono">{{ g.photo_count }}</span>
            <span class="chip-tick" aria-hidden="true">✓</span>
          </button>
        </div>
        <p class="muted no-gal" *ngIf="galleries().length === 0">
          No galleries yet — start one below.
        </p>

        <!-- Inline new-gallery row -->
        <div class="new-row">
          <span class="new-plus">＋</span>
          <input
            [(ngModel)]="newGalleryName"
            placeholder="Start a new gallery…"
            (keyup.enter)="createInlineGallery()"
            [disabled]="busy()"
          />
          <button
            type="button"
            class="btn-ghost small"
            (click)="createInlineGallery()"
            [disabled]="!newGalleryName.trim() || busy()"
          >
            Create
          </button>
        </div>

        <p class="err" *ngIf="pickerError()">{{ pickerError() }}</p>

        <footer class="modal-foot">
          <button
            class="btn-accent"
            [disabled]="pickerSel().size === 0 || busy()"
            (click)="applyGalleries()"
          >
            {{ busy() ? 'Adding…' : 'Add to ' + pickerSel().size + ' gallery' + (pickerSel().size === 1 ? '' : 'ies') }}
          </button>
          <button class="btn-ghost" (click)="closePicker()">Cancel</button>
        </footer>
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
      .sorter {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.15rem;
      }
      .sort-lbl {
        font-size: 0.72rem;
        color: var(--color-muted);
        padding: 0 0.3rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .sorter button {
        border: none;
        background: transparent;
        color: var(--color-muted);
        padding: 0.25rem 0.6rem;
        border-radius: calc(var(--radius) - 2px);
        font-size: 0.82rem;
        cursor: pointer;
      }
      .sorter button.on {
        background: var(--color-accent);
        color: #fff;
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
      /* Full-width month divider inside the grid flow. */
      .month-sep {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 0.8rem;
        margin: 0.8rem 0 0.2rem;
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 1.05rem;
        color: var(--color-ink);
      }
      .month-sep::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--color-border);
      }
      /* Sticky "how far back" indicator. */
      .date-pill {
        position: fixed;
        top: 50%;
        right: clamp(0.5rem, 2vw, 1.5rem);
        transform: translateY(-50%);
        z-index: 35;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.1rem;
        padding: 0.5rem 0.8rem;
        background: color-mix(in srgb, var(--color-surface) 90%, transparent);
        backdrop-filter: blur(8px);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        pointer-events: none;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
      }
      .date-pill strong {
        font-family: var(--font-display);
        font-size: 0.9rem;
      }
      .date-pill span {
        font-size: 0.72rem;
        color: var(--color-muted);
      }
      /* Skeleton shimmer placeholders. */
      .card.skel {
        aspect-ratio: 1;
        background: var(--color-surface);
        position: relative;
        overflow: hidden;
      }
      .card.skel::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(128, 128, 128, 0.14),
          transparent
        );
        transform: translateX(-100%);
        animation: shimmer 1.3s infinite;
      }
      @keyframes shimmer {
        100% {
          transform: translateX(100%);
        }
      }
      .end-hint {
        text-align: center;
        padding: 2rem;
        font-family: var(--font-mono);
        font-size: 0.85rem;
      }
      @media (max-width: 720px) {
        .date-pill {
          top: auto;
          bottom: 4.5rem;
          transform: none;
        }
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
      .edit,
      .star {
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
      .star {
        bottom: 0.4rem;
        right: 0.4rem;
        color: var(--color-muted);
      }
      .star.on {
        color: var(--cap-brass-deep);
        background: color-mix(in srgb, var(--cap-brass) 30%, var(--color-paper));
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
      /* Tag chips in the inline editor */
      .tag-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        padding: 0.3rem;
        align-items: center;
      }
      .tag-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.2rem 0.5rem;
        border-radius: 999px;
        font-family: var(--font-mono);
        font-size: 0.72rem;
        background: var(--cap-cream-hi);
        color: var(--cap-ink-2);
        box-shadow: inset 0 0 0 1px var(--color-border);
      }
      [data-theme='dark'] .tag-chip {
        background: color-mix(in srgb, var(--cap-ink) 55%, transparent);
        color: var(--cap-cream-hi);
      }
      .tag-chip button {
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        opacity: 0.6;
        padding: 0;
        line-height: 1;
      }
      .tag-chip button:hover {
        opacity: 1;
        color: var(--color-accent);
      }
      .tag-add {
        flex: 1 1 90px;
        min-width: 70px;
        font-size: 0.75rem !important;
        padding: 0.25rem 0.4rem !important;
      }
      /* Bulk tag mini-form */
      .bulk-tag {
        display: inline-flex;
        gap: 0.3rem;
        align-items: center;
      }
      .bulk-tag input {
        width: 6.5rem;
        padding: 0.4rem 0.5rem;
        font-size: 0.82rem;
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
      /* ── Add-to-gallery modal ── */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: grid;
        place-items: center;
        padding: 1rem;
        background: color-mix(in srgb, var(--cap-ink) 55%, transparent);
        backdrop-filter: blur(4px);
        animation: fade-in 0.2s var(--ease);
      }
      @keyframes fade-in {
        from {
          opacity: 0;
        }
      }
      .modal {
        width: min(560px, 100%);
        max-height: min(90vh, 720px);
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        padding: 1.4rem;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        border-radius: calc(var(--radius) * 4);
        box-shadow: 0 40px 80px -30px rgba(20, 17, 16, 0.55),
          0 12px 24px -10px rgba(20, 17, 16, 0.35);
        animation: modal-in 0.25s var(--ease);
      }
      @keyframes modal-in {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
      }
      .modal-head h2 {
        font-family: var(--font-display);
        font-weight: 800;
        letter-spacing: -0.03em;
        font-size: 1.4rem;
        margin: 0;
      }
      .modal-head .mono {
        display: block;
        margin-top: 0.15rem;
        font-size: 0.75rem;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        overflow: auto;
        max-height: 40vh;
        padding: 0.15rem;
      }
      .chip {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 0.9rem;
        background: var(--color-paper);
        border: 1.5px solid var(--color-border);
        border-radius: 999px;
        color: var(--color-ink);
        font-family: var(--font-body);
        font-size: 0.88rem;
        cursor: pointer;
        transition: transform 0.15s var(--ease), border-color 0.2s var(--ease),
          background 0.2s var(--ease), color 0.2s var(--ease);
      }
      .chip:hover {
        border-color: var(--cap-capy);
        transform: translateY(-1px);
      }
      .chip.on {
        background: var(--cap-ember);
        border-color: var(--cap-ember);
        color: var(--cap-cream-hi);
      }
      .chip .chip-count {
        font-size: 0.72rem;
        color: var(--color-muted);
        opacity: 0.85;
      }
      .chip.on .chip-count {
        color: var(--cap-cream-hi);
      }
      .chip .chip-tick {
        opacity: 0;
        font-weight: 700;
        transition: opacity 0.15s var(--ease);
      }
      .chip.on .chip-tick {
        opacity: 1;
      }
      .chip .chip-vis {
        line-height: 1;
      }
      .no-gal {
        text-align: center;
        padding: 1.4rem 0;
      }

      .new-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.7rem;
        border: 1px dashed var(--color-border);
        border-radius: var(--radius);
        background: var(--color-paper);
      }
      .new-row .new-plus {
        font-family: var(--font-display);
        font-weight: 800;
        color: var(--cap-brass);
        font-size: 1.05rem;
      }
      .new-row input {
        flex: 1 1 auto;
        min-width: 0;
        border: none;
        background: transparent;
        padding: 0.3rem 0;
        outline: none;
      }
      .small {
        padding: 0.35rem 0.7rem !important;
        font-size: 0.8rem;
      }

      .modal-foot {
        display: flex;
        gap: 0.6rem;
        justify-content: flex-end;
      }
      .modal-foot .btn-accent {
        flex: 1 1 auto;
      }

      @media (max-width: 720px) {
        .bulk-bar {
          left: 0;
        }
      }
    `,
  ],
})
export class AdminPhotosComponent implements OnInit, AfterViewInit {
  @ViewChild('grid') gridRef?: ElementRef<HTMLElement>;

  photos = signal<Photo[]>([]);
  galleries = signal<Gallery[]>([]);
  total = signal(0);
  loading = signal(true);
  loadingMore = signal(false);
  allLoaded = signal(false);
  uploading = signal(false);
  uploadCount = signal(0);
  dragOver = signal(false);
  editing = signal<string | null>(null);
  error = signal('');

  // Timeline & sort
  currentLabel = signal('');
  currentBack = signal('');
  sortMode = signal<'taken' | 'uploaded'>('taken');

  // Infinite scroll
  private page = 1;
  private pageSize = 40;
  private skelCount = 12;
  private seen = new Set<string>();
  private ticking = false;
  skeletons = computed(() =>
    this.loadingMore() ? Array.from({ length: this.skelCount }, (_, i) => i) : [],
  );

  private readonly MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Bulk selection
  selected = signal<Set<string>>(new Set());
  showPicker = signal(false);
  pickerSel = signal<Set<string>>(new Set());
  pickerError = signal('');
  newGalleryName = '';
  busy = signal(false);

  // Tags
  allTags = signal<string[]>([]);
  tagDraft: Record<string, string> = {};
  bulkTagDraft = '';

  allSelected = computed(
    () => this.photos().length > 0 && this.selected().size === this.photos().length,
  );

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    this.api.getAdminGalleries().subscribe({
      next: (galleries) => this.galleries.set(galleries),
    });
    this.api.getPhotoTags().subscribe({ next: (t) => this.allTags.set(t) });
  }

  ngAfterViewInit(): void {
    // Size each page to ~5 rows of the actual grid, then load the first page.
    this.pageSize = this.computePageSize();
    this.skelCount = Math.max(6, this.pageSize / 2);
    this.loadMore();
  }

  /** Columns × 5 rows, from the measured grid width (falls back to 40). */
  private computePageSize(): number {
    const el = this.gridRef?.nativeElement;
    const width = el?.clientWidth ?? 0;
    if (!width) return 40;
    const minCol = 150;
    const gap = 12.8; // 0.8rem
    const cols = Math.max(2, Math.floor((width + gap) / (minCol + gap)));
    return Math.min(120, cols * 5);
  }

  /** Switch the sort field and reload from the top. */
  setSort(mode: 'taken' | 'uploaded'): void {
    if (this.sortMode() === mode) return;
    this.sortMode.set(mode);
    this.photos.set([]);
    this.seen.clear();
    this.page = 1;
    this.allLoaded.set(false);
    this.loading.set(true);
    this.currentLabel.set('');
    this.loadMore();
  }

  private loadMore(): void {
    if (this.loadingMore() || this.allLoaded()) return;
    this.loadingMore.set(true);
    this.api.getAdminPhotos(this.page, this.pageSize, this.sortMode()).subscribe({
      next: (res) => {
        this.total.set(res.total);
        // Dedupe guard: never render a photo id twice, whatever the paging does.
        const fresh = res.items.filter((p) => !this.seen.has(p.id));
        fresh.forEach((p) => this.seen.add(p.id));
        this.photos.update((cur) => [...cur, ...fresh]);
        this.page += 1;
        if (this.photos().length >= res.total || res.items.length === 0) {
          this.allLoaded.set(true);
        }
        this.loading.set(false);
        this.loadingMore.set(false);
        // First fill often doesn't reach the fold — top up, and set the pill.
        setTimeout(() => {
          this.updateSticky();
          this.maybeLoadMore();
        });
      },
      error: () => {
        this.error.set('Could not load photos.');
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  private maybeLoadMore(): void {
    const nearBottom =
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 700;
    if (nearBottom) this.loadMore();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.updateSticky();
      this.maybeLoadMore();
      this.ticking = false;
    });
  }

  /** Close the picker modal on Escape. */
  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.showPicker()) this.closePicker();
  }

  // ── Timeline helpers ──
  /** The date the timeline groups by — capture date in "taken" mode (falling
   *  back to upload date when EXIF has none), else upload date. Matches the
   *  server's sort so groups line up with the order. */
  private effDate(p: Photo): string {
    return this.sortMode() === 'taken' ? p.taken_at ?? p.uploaded_at : p.uploaded_at;
  }
  private ym(p: Photo): [number, number] {
    const d = new Date(this.effDate(p));
    return [d.getFullYear(), d.getMonth()];
  }
  monthChanged(i: number): boolean {
    const list = this.photos();
    if (i === 0) return true;
    const [y1, m1] = this.ym(list[i]);
    const [y0, m0] = this.ym(list[i - 1]);
    return y1 !== y0 || m1 !== m0;
  }
  monthLabel(p: Photo): string {
    const [y, m] = this.ym(p);
    return `${this.MONTHS[m]} ${y}`;
  }
  shortMonth(p: Photo): string {
    const [y, m] = this.ym(p);
    return `${this.MONTHS[m].slice(0, 3)} ${y}`;
  }
  monthBack(p: Photo): string {
    const [y, m] = this.ym(p);
    const now = new Date();
    const months = (now.getFullYear() - y) * 12 + (now.getMonth() - m);
    if (months <= 0) return 'this month';
    if (months === 1) return '1 month back';
    if (months < 12) return `${months} months back`;
    const years = Math.round((months / 12) * 10) / 10;
    return `~${years} yr back`;
  }

  /** Reflect the topmost month divider that has scrolled past the header. */
  private updateSticky(): void {
    const seps = Array.from(
      document.querySelectorAll<HTMLElement>('.month-sep'),
    );
    if (!seps.length) {
      this.currentLabel.set('');
      return;
    }
    let active = seps[0];
    for (const s of seps) {
      if (s.getBoundingClientRect().top <= 96) active = s;
      else break;
    }
    this.currentLabel.set(active.dataset['label'] ?? '');
    this.currentBack.set(active.dataset['back'] ?? '');
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
        created.forEach((p) => this.seen.add(p.id));
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
      ids.forEach((id) => this.seen.delete(id));
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

  /** Open the picker and reset its transient state. */
  openPicker(): void {
    this.pickerSel.set(new Set());
    this.newGalleryName = '';
    this.pickerError.set('');
    this.showPicker.set(true);
  }

  closePicker(): void {
    this.showPicker.set(false);
    this.newGalleryName = '';
    this.pickerError.set('');
  }

  /** Create a new (public, default-layout) gallery inline and auto-select it
   *  in the picker so the next Add applies to it too. */
  createInlineGallery(): void {
    const name = this.newGalleryName.trim();
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) {
      this.pickerError.set('Name needs at least one letter or number.');
      return;
    }
    this.pickerError.set('');
    this.busy.set(true);
    this.api.createGallery({ name, slug }).subscribe({
      next: (g) => {
        this.galleries.update((cur) => [...cur, g]);
        const next = new Set(this.pickerSel());
        next.add(g.id);
        this.pickerSel.set(next);
        this.newGalleryName = '';
        this.busy.set(false);
      },
      error: (e) => {
        this.pickerError.set(e.error?.detail || 'Could not create gallery.');
        this.busy.set(false);
      },
    });
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
        // Refresh photo counts on affected galleries (local approximation:
        // add the count of photos that weren't already members).
        this.galleries.update((cur) =>
          cur.map((g) => {
            if (!gids.includes(g.id)) return g;
            const newlyAdded = ids.filter((pid) => {
              const p = this.photos().find((x) => x.id === pid);
              return !(p?.gallery_ids ?? []).includes(g.id);
            }).length;
            // newlyAdded is already reflected in the mapped photos above; here
            // we approximate the count bump by the size of `ids` not previously
            // linked. If exact, fine; if slightly stale, next reload fixes it.
            return { ...g, photo_count: g.photo_count + newlyAdded };
          }),
        );
        this.pickerSel.set(new Set());
        this.showPicker.set(false);
        this.busy.set(false);
      },
      error: () => {
        this.pickerError.set('Could not add to galleries.');
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

  // ── Tags ──
  isFeatured(p: Photo): boolean {
    return (p.tags ?? []).includes(FEATURED_TAG);
  }

  /** Star toggle: immediately persists the featured tag (no Save needed). */
  toggleFeatured(p: Photo): void {
    const on = this.isFeatured(p);
    const next = on
      ? (p.tags ?? []).filter((t) => t !== FEATURED_TAG)
      : [...(p.tags ?? []), FEATURED_TAG];
    p.tags = next;
    this.api.updatePhoto(p.id, { tags: next }).subscribe({
      next: (fresh) => {
        p.tags = fresh.tags ?? next;
        this.mergeTagVocab(p.tags);
      },
    });
  }

  /** Add a tag in the inline editor (local only; persisted on Save). */
  addTag(p: Photo, raw: string | undefined): void {
    const t = (raw ?? '').trim().toLowerCase();
    if (!t) return;
    if (!(p.tags ?? []).includes(t)) p.tags = [...(p.tags ?? []), t];
    this.tagDraft[p.id] = '';
  }

  removeTag(p: Photo, t: string): void {
    p.tags = (p.tags ?? []).filter((x) => x !== t);
  }

  save(p: Photo): void {
    this.api
      .updatePhoto(p.id, {
        title: p.title ?? null,
        caption: p.caption ?? null,
        tags: p.tags ?? [],
        gallery_ids: p.gallery_ids ?? [],
      })
      .subscribe((fresh) => {
        p.tags = fresh.tags ?? p.tags;
        this.mergeTagVocab(p.tags ?? []);
        this.editing.set(null);
      });
  }

  // ── Bulk tags ──
  bulkFeature(on: boolean): void {
    const ids = this.selectedIds();
    const add = on ? [FEATURED_TAG] : [];
    const remove = on ? [] : [FEATURED_TAG];
    this.api.bulkTags(ids, add, remove).subscribe({
      next: () => this.applyTagDeltaLocally(ids, add, remove),
    });
  }

  bulkAddTag(): void {
    const t = this.bulkTagDraft.trim().toLowerCase();
    if (!t) return;
    const ids = this.selectedIds();
    this.api.bulkTags(ids, [t], []).subscribe({
      next: () => {
        this.applyTagDeltaLocally(ids, [t], []);
        this.mergeTagVocab([t]);
        this.bulkTagDraft = '';
      },
    });
  }

  /** Mirror a bulk add/remove on the in-memory photos so the UI stays live. */
  private applyTagDeltaLocally(ids: string[], add: string[], remove: string[]): void {
    const sel = new Set(ids);
    const rm = new Set(remove);
    this.photos.update((cur) =>
      cur.map((p) => {
        if (!sel.has(p.id)) return p;
        const tags = new Set((p.tags ?? []).filter((t) => !rm.has(t)));
        add.forEach((t) => tags.add(t));
        return { ...p, tags: Array.from(tags) };
      }),
    );
  }

  private mergeTagVocab(tags: string[]): void {
    const set = new Set([...this.allTags(), ...tags]);
    this.allTags.set([...set].sort());
  }

  remove(p: Photo): void {
    if (!confirm(`Delete "${p.title || p.filename}"? This cannot be undone.`)) return;
    this.api.deletePhoto(p.id).subscribe(() => {
      this.seen.delete(p.id);
      this.photos.update((cur) => cur.filter((x) => x.id !== p.id));
      this.total.update((t) => t - 1);
      this.editing.set(null);
    });
  }
}
