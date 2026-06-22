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
 *  shown instantly as a placeholder; the original fades in once decoded. */
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
          <img
            class="full"
            [class.loaded]="fullLoaded()"
            [src]="api.imageUrl(current.original_url)"
            [alt]="current.title || current.filename"
            (load)="fullLoaded.set(true)"
          />
        </div>
        <figcaption *ngIf="current.title || current.caption">
          <h3 *ngIf="current.title">{{ current.title }}</h3>
          <p *ngIf="current.caption">{{ current.caption }}</p>
        </figcaption>
      </figure>

      <button class="nav next" *ngIf="photos.length > 1" (click)="next()" aria-label="Next">
        ›
      </button>

      <aside class="exif" *ngIf="exifRows().length">
        <dl>
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
      .exif {
        position: fixed;
        right: clamp(1rem, 4vw, 3rem);
        bottom: clamp(1rem, 4vw, 3rem);
        background: color-mix(in srgb, var(--color-surface) 80%, transparent);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.9rem 1.1rem;
        max-width: 260px;
      }
      .exif dl {
        margin: 0;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.25rem 0.9rem;
        font-size: 0.8rem;
      }
      .exif dt {
        color: var(--color-muted);
      }
      .exif dd {
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
        }
        .nav.prev {
          left: 0.5rem;
        }
        .nav.next {
          right: 0.5rem;
        }
        .exif {
          left: 1rem;
          right: 1rem;
          max-width: none;
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
  exifRows = signal<ExifRow[]>([]);

  constructor(public api: ApiService) {}

  get current(): Photo {
    return this.photos[this.index];
  }

  ngOnChanges(): void {
    this.refresh();
  }

  private refresh(): void {
    this.fullLoaded.set(false);
    this.exifRows.set(this.buildExif(this.current?.exif));
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
