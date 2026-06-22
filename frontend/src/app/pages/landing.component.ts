import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnInit,
  signal,
} from '@angular/core';

import { Photo } from '../models';
import { ApiService } from '../services/api.service';
import { LightboxComponent } from '../components/lightbox.component';
import { RevealDirective } from '../components/reveal.directive';

/**
 * The archive — an unstructured masonry stream of every visible photo.
 * Cells reveal on scroll, carry a low-amplitude breathing drift staggered by
 * index, and show a skeleton until the thumbnail decodes. Infinite scroll
 * pulls more pages as the user nears the bottom.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, LightboxComponent, RevealDirective],
  template: `
    <section class="masonry" [class.empty]="!loading() && photos().length === 0">
      <figure
        class="cell"
        appReveal
        *ngFor="let photo of photos(); let i = index"
        [style.--i]="i % 12"
        (click)="open(i)"
      >
        <div class="ph" [class.loaded]="loaded[photo.id]" [style.aspectRatio]="ratio(photo)">
          <img
            [src]="api.imageUrl(photo.thumbnail_url)"
            [alt]="photo.title || photo.filename"
            loading="lazy"
            (load)="loaded[photo.id] = true"
          />
        </div>
      </figure>
    </section>

    <p class="hint" *ngIf="loading()">loading…</p>
    <p class="hint" *ngIf="!loading() && photos().length === 0">
      No photos here yet.
    </p>

    <app-lightbox
      *ngIf="lightboxIndex() !== null"
      [photos]="photos()"
      [index]="lightboxIndex()!"
      (close)="lightboxIndex.set(null)"
    ></app-lightbox>
  `,
  styles: [
    `
      .masonry {
        column-gap: var(--gap);
        columns: 4 280px;
        padding: clamp(1rem, 4vw, 3rem);
        max-width: var(--max-width);
        margin: 0 auto;
      }
      .cell {
        margin: 0 0 var(--gap);
        break-inside: avoid;
        cursor: pointer;
        opacity: 0;
        transform: translateY(18px);
        transition: opacity 0.7s var(--ease), transform 0.7s var(--ease);
      }
      .cell.revealed {
        opacity: 1;
        transform: translateY(0);
        /* very slight, slow vertical breathing, staggered by index */
        animation: breathe 9s ease-in-out infinite;
        animation-delay: calc(var(--i) * -0.7s);
      }
      .cell:hover .ph img {
        transform: scale(1.03);
      }
      @keyframes breathe {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-4px);
        }
      }
      .ph {
        position: relative;
        overflow: hidden;
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      .ph::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(128, 128, 128, 0.12),
          transparent
        );
        transform: translateX(-100%);
        animation: shimmer 1.4s infinite;
      }
      .ph.loaded::after {
        display: none;
      }
      @keyframes shimmer {
        100% {
          transform: translateX(100%);
        }
      }
      .ph img {
        display: block;
        width: 100%;
        height: auto;
        opacity: 0;
        transition: opacity 0.5s var(--ease), transform 0.5s var(--ease);
      }
      .ph.loaded img {
        opacity: 1;
      }
      .hint {
        text-align: center;
        color: var(--color-muted);
        font-family: var(--font-mono);
        font-size: 0.85rem;
        padding: 2rem;
      }
    `,
  ],
})
export class LandingComponent implements OnInit {
  photos = signal<Photo[]>([]);
  loading = signal(false);
  lightboxIndex = signal<number | null>(null);
  loaded: Record<string, boolean> = {};

  private page = 1;
  private readonly pageSize = 60;
  private total = Infinity;

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    this.loadMore();
  }

  ratio(photo: Photo): string {
    return photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4';
  }

  open(index: number): void {
    this.lightboxIndex.set(index);
  }

  private loadMore(): void {
    if (this.loading() || this.photos().length >= this.total) return;
    this.loading.set(true);
    this.api.getPhotos(this.page, this.pageSize).subscribe({
      next: (res) => {
        this.total = res.total;
        this.photos.update((cur) => [...cur, ...res.items]);
        this.page += 1;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    const nearBottom =
      window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 600;
    if (nearBottom) this.loadMore();
  }
}
