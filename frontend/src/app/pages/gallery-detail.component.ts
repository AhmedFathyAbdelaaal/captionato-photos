import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { GalleryDetail, Photo } from '../models';
import { ApiService } from '../services/api.service';
import { ThemeService } from '../services/theme.service';
import { LightboxComponent } from '../components/lightbox.component';
import { RevealDirective } from '../components/reveal.directive';

@Component({
  selector: 'app-gallery-detail',
  standalone: true,
  imports: [CommonModule, LightboxComponent, RevealDirective],
  template: `
    <div class="wrap" *ngIf="gallery() as g">
      <header class="head">
        <h1>{{ g.name }}</h1>
        <p *ngIf="g.description">{{ g.description }}</p>
      </header>

      <ng-container [ngSwitch]="g.layout">
        <!-- MASONRY -->
        <section *ngSwitchCase="'masonry'" class="masonry">
          <figure class="cell" appReveal *ngFor="let p of g.photos; let i = index" (click)="open(i)">
            <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
          </figure>
        </section>

        <!-- UNIFORM GRID -->
        <section *ngSwitchCase="'grid'" class="uniform">
          <figure class="cell" appReveal *ngFor="let p of g.photos; let i = index" (click)="open(i)">
            <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
          </figure>
        </section>

        <!-- EDITORIAL -->
        <section *ngSwitchCase="'editorial'" class="editorial">
          <figure class="cell" appReveal *ngFor="let p of g.photos; let i = index" (click)="open(i)">
            <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
            <figcaption *ngIf="p.title || p.caption">
              <strong *ngIf="p.title">{{ p.title }}</strong>
              <span *ngIf="p.caption">{{ p.caption }}</span>
            </figcaption>
          </figure>
        </section>

        <!-- SLIDESHOW -->
        <section *ngSwitchCase="'slideshow'" class="slideshow">
          <button class="snav prev" (click)="slidePrev(g.photos.length)" aria-label="Previous">‹</button>
          <figure class="slide" (click)="open(slide())">
            <img
              [src]="api.imageUrl(g.photos[slide()].thumbnail_url)"
              [alt]="g.photos[slide()].title || g.photos[slide()].filename"
            />
          </figure>
          <button class="snav next" (click)="slideNext(g.photos.length)" aria-label="Next">›</button>
          <div class="dots">
            <span *ngFor="let p of g.photos; let i = index" [class.on]="i === slide()"></span>
          </div>
        </section>

        <!-- MOOD BOARD -->
        <section *ngSwitchCase="'moodboard'" class="moodboard">
          <figure
            class="cell"
            appReveal
            *ngFor="let p of g.photos; let i = index"
            [style.--rot.deg]="rotation(p)"
            (click)="open(i)"
          >
            <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
          </figure>
        </section>
      </ng-container>
    </div>

    <p class="hint" *ngIf="loading()">loading…</p>
    <p class="hint" *ngIf="notFound()">Gallery not found.</p>

    <app-lightbox
      *ngIf="lightboxIndex() !== null && gallery()"
      [photos]="gallery()!.photos"
      [index]="lightboxIndex()!"
      (close)="lightboxIndex.set(null)"
    ></app-lightbox>
  `,
  styles: [
    `
      .wrap {
        max-width: var(--max-width);
        margin: 0 auto;
        padding: clamp(1.5rem, 5vw, 4rem);
      }
      .head {
        text-align: center;
        margin-bottom: 2.5rem;
      }
      .head h1 {
        font-size: clamp(2rem, 6vw, 3.4rem);
      }
      .head p {
        color: var(--color-muted);
        max-width: 60ch;
        margin: -0.3rem auto 0;
      }
      figure {
        margin: 0;
        cursor: pointer;
      }
      img {
        display: block;
        width: 100%;
        border-radius: var(--radius);
      }
      .cell {
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 0.6s var(--ease), transform 0.6s var(--ease);
      }
      .cell.revealed {
        opacity: 1;
        transform: translateY(0);
      }

      /* masonry */
      .masonry {
        columns: 4 280px;
        column-gap: var(--gap);
      }
      .masonry .cell {
        margin-bottom: var(--gap);
        break-inside: avoid;
      }

      /* uniform grid */
      .uniform {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: var(--gap);
      }
      .uniform .cell img {
        aspect-ratio: 1;
        object-fit: cover;
      }

      /* editorial */
      .editorial {
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: clamp(3rem, 8vw, 6rem);
      }
      .editorial figcaption {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin-top: 0.8rem;
        color: var(--color-muted);
        font-size: 0.9rem;
      }
      .editorial figcaption strong {
        font-family: var(--font-display);
        color: var(--color-ink);
      }

      /* slideshow */
      .slideshow {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 1rem;
        position: relative;
      }
      .slide img {
        max-height: 78vh;
        object-fit: contain;
        margin: 0 auto;
      }
      .snav {
        background: transparent;
        border: 1px solid var(--color-border);
        color: var(--color-ink);
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        font-size: 1.7rem;
      }
      .snav:hover {
        background: var(--color-accent);
        color: #fff;
        border-color: var(--color-accent);
      }
      .dots {
        grid-column: 1 / -1;
        display: flex;
        justify-content: center;
        gap: 0.4rem;
        margin-top: 1rem;
      }
      .dots span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-border);
      }
      .dots span.on {
        background: var(--color-accent);
      }

      /* mood board */
      .moodboard {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: clamp(0.5rem, 2vw, 1.5rem);
        padding: 2rem 0;
      }
      .moodboard .cell {
        width: clamp(180px, 24vw, 320px);
        transform: rotate(var(--rot)) translateY(16px);
        transition: transform 0.4s var(--ease), opacity 0.6s var(--ease);
      }
      .moodboard .cell.revealed {
        transform: rotate(var(--rot)) translateY(0);
      }
      .moodboard .cell img {
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
      }
      .moodboard .cell:hover {
        transform: rotate(0deg) scale(1.04);
        z-index: 2;
      }

      .hint {
        text-align: center;
        color: var(--color-muted);
        font-family: var(--font-mono);
        padding: 3rem;
      }
    `,
  ],
})
export class GalleryDetailComponent implements OnInit, OnDestroy {
  gallery = signal<GalleryDetail | null>(null);
  loading = signal(true);
  notFound = signal(false);
  lightboxIndex = signal<number | null>(null);
  slide = signal(0);

  constructor(
    private route: ActivatedRoute,
    public api: ApiService,
    private theme: ThemeService,
  ) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug')!;
    this.api.getGallery(slug).subscribe({
      next: (g) => {
        this.gallery.set(g);
        this.loading.set(false);
        this.theme.setGalleryOverride(g.force_theme, g.accent_color ?? null);
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
  }

  ngOnDestroy(): void {
    this.theme.clearGalleryOverride();
  }

  open(index: number): void {
    this.lightboxIndex.set(index);
  }

  slideNext(len: number): void {
    this.slide.set((this.slide() + 1) % len);
  }
  slidePrev(len: number): void {
    this.slide.set((this.slide() - 1 + len) % len);
  }

  /** Stable small rotation seeded by photo id, so mood boards don't reshuffle. */
  rotation(p: Photo): number {
    let h = 0;
    for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
    return ((h % 11) - 5) * 0.8; // -4°..+4°
  }
}
