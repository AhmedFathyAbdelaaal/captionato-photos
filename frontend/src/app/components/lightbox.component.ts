import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  signal,
} from '@angular/core';

import { Exif, Photo } from '../models';
import { ApiService } from '../services/api.service';

interface ExifRow {
  label: string;
  value: string;
}

/** Full-screen overlay shared by the landing + gallery views. The thumbnail is
 *  shown instantly (blurred) as a placeholder; a spinner runs while the full
 *  resolution original downloads, then it fades in over the thumbnail. */
@Component({
  selector: 'app-lightbox',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="backdrop" (click)="onBackdrop($event)">
      <button class="close" (click)="close.emit()" aria-label="Close">✕</button>

      <button class="nav prev" *ngIf="photos.length > 1" (click)="prev()" aria-label="Previous">
        ‹
      </button>

      <figure class="stage" (click)="$event.stopPropagation()">
        <div class="frame">
          <!-- Thumbnail placeholder, blurred until the original loads. -->
          <img class="thumb" [class.hidden]="fullLoaded()" [src]="api.imageUrl(current.thumbnail_url)" alt="" />

          <!-- Full-resolution original. -->
          <img
            class="full"
            [class.loaded]="fullLoaded()"
            [src]="fullSrc()"
            [alt]="current.title || current.filename"
            (load)="fullLoaded.set(true)"
            (error)="fullError.set(true)"
          />

          <!-- Loading spinner while the original is in flight. -->
          <div class="loader" *ngIf="!fullLoaded() && !fullError()">
            <span class="spinner"></span>
            <span class="loading-label mono">loading full resolution…</span>
          </div>

          <!-- Fallback if the original fails to load. -->
          <div class="loader err" *ngIf="fullError()">
            <span class="mono">couldn't load full image</span>
            <button class="btn-ghost" (click)="retry()">retry</button>
          </div>
        </div>

        <figcaption *ngIf="current.title || current.caption">
          <h3 *ngIf="current.title">{{ current.title }}</h3>
          <p *ngIf="current.caption">{{ current.caption }}</p>
        </figcaption>
      </figure>

      <button class="nav next" *ngIf="photos.length > 1" (click)="next()" aria-label="Next">
        ›
      </button>

      <aside class="panel" (click)="$event.stopPropagation()">
        <a class="download" [href]="downloadUrl" [attr.download]="current.filename">
          ↓ Download original
        </a>
        <dl *ngIf="exifRows().length">
          <ng-container *ngFor="let row of exifRows()">
            <dt>{{ row.label }}</dt>
            <dd class="mono">{{ row.value }}</dd>
          </ng-container>
        </dl>
      </aside>
    </div>
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 0.5rem;
        padding: clamp(1rem, 4vw, 3rem);
        background: color-mix(in srgb, var(--color-paper) 12%, #000 88%);
        backdrop-filter: blur(8px);
        animation: fade 0.25s var(--ease);
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
      .stage {
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.8rem;
        max-height: 100%;
      }
      .frame {
        position: relative;
        display: grid;
        place-items: center;
        max-height: 82vh;
      }
      .frame img {
        max-width: 100%;
        max-height: 82vh;
        object-fit: contain;
        border-radius: var(--radius);
        grid-area: 1 / 1;
      }
      .thumb {
        filter: blur(12px);
        transform: scale(1.02);
        transition: opacity 0.3s var(--ease);
      }
      .thumb.hidden {
        opacity: 0;
      }
      .full {
        opacity: 0;
        transition: opacity 0.5s var(--ease);
      }
      .full.loaded {
        opacity: 1;
      }
      .loader {
        grid-area: 1 / 1;
        z-index: 2;
        align-self: center;
        justify-self: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.7rem;
        padding: 1rem 1.4rem;
        border-radius: var(--radius);
        background: rgba(0, 0, 0, 0.35);
        color: #f5f5f0;
      }
      .loader.err {
        background: rgba(0, 0, 0, 0.55);
      }
      .loading-label {
        font-size: 0.75rem;
        color: #d9d9d2;
      }
      .spinner {
        width: 2.4rem;
        height: 2.4rem;
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.25);
        border-top-color: var(--color-accent);
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      figcaption {
        text-align: center;
        color: #f5f5f0;
      }
      figcaption h3 {
        font-size: 1.1rem;
        margin: 0;
      }
      figcaption p {
        color: #c9c9c2;
        margin: 0.2rem 0 0;
        font-size: 0.9rem;
      }
      .close {
        position: fixed;
        top: 1.2rem;
        right: 1.4rem;
        width: 2.4rem;
        height: 2.4rem;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        font-size: 1rem;
        z-index: 3;
      }
      .nav {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: none;
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        font-size: 1.8rem;
        line-height: 1;
        transition: background 0.2s var(--ease);
      }
      .nav:hover {
        background: var(--color-accent);
      }
      .panel {
        position: fixed;
        right: clamp(1rem, 4vw, 3rem);
        bottom: clamp(1rem, 4vw, 3rem);
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        background: color-mix(in srgb, var(--color-surface) 80%, transparent);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.9rem 1.1rem;
        max-width: 260px;
      }
      .download {
        display: inline-block;
        text-align: center;
        background: var(--color-accent);
        color: #fff;
        border-radius: var(--radius);
        padding: 0.55rem 0.9rem;
        font-weight: 600;
        font-size: 0.9rem;
        transition: filter 0.2s var(--ease);
      }
      .download:hover {
        filter: brightness(1.08);
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.25rem 0.9rem;
        font-size: 0.8rem;
      }
      dt {
        color: var(--color-muted);
      }
      dd {
        margin: 0;
        text-align: right;
        color: var(--color-ink);
      }
      @media (max-width: 720px) {
        .backdrop {
          grid-template-columns: 1fr;
        }
        .nav {
          position: fixed;
          top: 50%;
          z-index: 3;
        }
        .nav.prev {
          left: 0.5rem;
        }
        .nav.next {
          right: 0.5rem;
        }
        .panel {
          left: 1rem;
          right: 1rem;
          max-width: none;
          flex-direction: row;
          align-items: center;
          flex-wrap: wrap;
        }
        .panel dl {
          flex: 1;
        }
      }
    `,
  ],
})
export class LightboxComponent implements OnChanges {
  @Input({ required: true }) photos: Photo[] = [];
  @Input() index = 0;
  @Output() close = new EventEmitter<void>();

  fullLoaded = signal(false);
  fullError = signal(false);
  exifRows = signal<ExifRow[]>([]);
  private retryCount = signal(0);

  constructor(public api: ApiService) {}

  get current(): Photo {
    return this.photos[this.index];
  }

  /** Full-res src, with a cache-busting suffix once the user hits retry so the
   *  browser actually re-requests a previously-failed image. */
  fullSrc(): string {
    const url = this.api.imageUrl(this.current.original_url);
    return this.retryCount() ? `${url}?r=${this.retryCount()}` : url;
  }

  get downloadUrl(): string {
    return this.api.imageUrl(this.current.original_url) + '?download=1';
  }

  ngOnChanges(): void {
    this.refresh();
  }

  private refresh(): void {
    this.fullLoaded.set(false);
    this.fullError.set(false);
    this.retryCount.set(0);
    this.exifRows.set(this.buildExif(this.current?.exif));
  }

  retry(): void {
    this.fullError.set(false);
    this.fullLoaded.set(false);
    this.retryCount.update((n) => n + 1); // changes src -> forces a reload
  }

  private buildExif(exif?: Exif | null): ExifRow[] {
    if (!exif) return [];
    const order: [keyof Exif, string][] = [
      ['camera', 'Camera'],
      ['lens', 'Lens'],
      ['focal_length', 'Focal'],
      ['aperture', 'Aperture'],
      ['shutter_speed', 'Shutter'],
      ['iso', 'ISO'],
      ['date_taken', 'Taken'],
    ];
    return order
      .filter(([k]) => exif[k])
      .map(([k, label]) => ({ label, value: String(exif[k]) }));
  }

  next(): void {
    this.index = (this.index + 1) % this.photos.length;
    this.refresh();
  }

  prev(): void {
    this.index = (this.index - 1 + this.photos.length) % this.photos.length;
    this.refresh();
  }

  onBackdrop(_: MouseEvent): void {
    this.close.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.close.emit();
    else if (e.key === 'ArrowRight') this.next();
    else if (e.key === 'ArrowLeft') this.prev();
  }
}
