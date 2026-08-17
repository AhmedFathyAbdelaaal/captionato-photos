import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, signal } from '@angular/core';

import { Photo } from '../models';
import { ApiService } from '../services/api.service';
import { LightboxComponent } from '../components/lightbox.component';
import { RevealDirective } from '../components/reveal.directive';

interface MonthGroup {
  key: string;
  label: string;
  photos: Photo[];
}

/**
 * The full archive — every visible photo, latest → oldest, grouped into months
 * with sticky headers that double as a scroll timeline. Masonry within each
 * month; infinite scroll pulls more pages, de-duplicated by id.
 */
@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [CommonModule, LightboxComponent, RevealDirective],
  template: `
    <header class="intro">
      <h1>Portfolio</h1>
      <div class="rule"></div>
      <p>{{ total() ? (total() + ' photographs, newest first') : 'The full archive' }}</p>
    </header>

    <section
      class="feed"
      [class.empty]="!loading() && photos().length === 0"
    >
      <div class="month" *ngFor="let g of groups()">
        <h2 class="month-head">{{ g.label }}</h2>
        <div class="masonry">
          <figure
            class="cell"
            appReveal
            *ngFor="let photo of g.photos; let i = index"
            [style.--i]="i % 12"
            (click)="open(photo)"
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
        </div>
      </div>

      <!-- Skeleton shimmer while the next page loads -->
      <div class="masonry skel-wrap" *ngIf="loadingMore()">
        <div class="cell skel" *ngFor="let s of skeletons()" [style.aspectRatio]="skelRatio(s)"></div>
      </div>
    </section>

    <p class="hint" *ngIf="!loading() && photos().length === 0">No photos here yet.</p>
    <p class="hint" *ngIf="allLoaded() && photos().length > 0">— the beginning —</p>

    <app-lightbox
      *ngIf="lightboxIndex() !== null"
      [photos]="photos()"
      [index]="lightboxIndex()!"
      (close)="lightboxIndex.set(null)"
    ></app-lightbox>
  `,
  styles: [
    `
      .intro {
        text-align: center;
        padding: clamp(2rem, 6vw, 4rem) 1rem 0.5rem;
      }
      .intro h1 {
        font-size: clamp(2.2rem, 6vw, 3.6rem);
      }
      .rule {
        width: 64px;
        height: 4px;
        margin: 0.7rem auto 0;
        border-radius: 2px;
        background: var(--color-accent);
      }
      .intro p {
        color: var(--color-muted);
        margin-top: 0.8rem;
        font-family: var(--font-mono);
        font-size: 0.85rem;
      }
      .feed {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: clamp(1rem, 4vw, 3rem);
      }
      .month {
        margin-bottom: 1.5rem;
      }
      /* Sticky header = the scroll timeline. Sits just under the site nav. */
      .month-head {
        position: sticky;
        top: 3.35rem;
        z-index: 20;
        margin: 0 0 1rem;
        padding: 0.6rem 0.2rem;
        font-family: var(--font-display);
        font-size: clamp(1.1rem, 3vw, 1.5rem);
        background: color-mix(in srgb, var(--color-paper) 90%, transparent);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--color-border);
      }
      .masonry {
        column-gap: var(--gap);
        columns: 4 280px;
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
        animation: breathe 9s ease-in-out infinite;
        animation-delay: calc(var(--i) * -0.7s);
      }
      .cell:hover .ph img {
        transform: scale(1.03);
      }
      @keyframes breathe {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
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
        background: linear-gradient(90deg, transparent, rgba(128, 128, 128, 0.12), transparent);
        transform: translateX(-100%);
        animation: shimmer 1.4s infinite;
      }
      .ph.loaded::after {
        display: none;
      }
      @keyframes shimmer {
        100% { transform: translateX(100%); }
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
      .skel {
        break-inside: avoid;
        margin: 0 0 var(--gap);
        border-radius: var(--radius);
        background: var(--color-surface);
        position: relative;
        overflow: hidden;
      }
      .skel::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(128, 128, 128, 0.14), transparent);
        transform: translateX(-100%);
        animation: shimmer 1.3s infinite;
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
export class PortfolioComponent implements OnInit {
  photos = signal<Photo[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  allLoaded = signal(false);
  total = signal(0);
  lightboxIndex = signal<number | null>(null);
  loaded: Record<string, boolean> = {};

  private page = 1;
  private readonly pageSize = 60;
  private seen = new Set<string>();

  private readonly MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Photos arrive latest → oldest (by capture date), so a single forward pass
  // buckets months. Group by taken date, falling back to upload date.
  groups = computed<MonthGroup[]>(() => {
    const out: MonthGroup[] = [];
    let cur: MonthGroup | null = null;
    for (const p of this.photos()) {
      const d = new Date(p.taken_at ?? p.uploaded_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!cur || cur.key !== key) {
        cur = {
          key,
          label: `${this.MONTHS[d.getMonth()]} ${d.getFullYear()}`,
          photos: [],
        };
        out.push(cur);
      }
      cur.photos.push(p);
    }
    return out;
  });

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    this.loadMore();
  }

  ratio(photo: Photo): string {
    return photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4';
  }
  // A little variety in the skeleton heights so the shimmer block isn't a grid.
  skeletons(): number[] {
    return [0, 1, 2, 3, 4, 5, 6, 7];
  }
  skelRatio(i: number): string {
    return ['3 / 4', '1 / 1', '4 / 5', '2 / 3'][i % 4];
  }

  open(photo: Photo): void {
    this.lightboxIndex.set(this.photos().indexOf(photo));
  }

  private loadMore(): void {
    if (this.loadingMore() || this.allLoaded()) return;
    this.loadingMore.set(true);
    this.api.getPhotos(this.page, this.pageSize).subscribe({
      next: (res) => {
        this.total.set(res.total);
        const fresh = res.items.filter((p) => !this.seen.has(p.id));
        fresh.forEach((p) => this.seen.add(p.id));
        this.photos.update((cur) => [...cur, ...fresh]);
        this.page += 1;
        if (this.photos().length >= res.total || res.items.length === 0) {
          this.allLoaded.set(true);
        }
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    const nearBottom =
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 800;
    if (nearBottom) this.loadMore();
  }
}
