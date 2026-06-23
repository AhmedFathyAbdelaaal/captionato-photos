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
        <div class="accent-rule"></div>
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

        <!-- COLLAGE / OVERLAP -->
        <section *ngSwitchCase="'collage'" class="collage">
          <figure
            class="cell"
            appReveal
            *ngFor="let p of g.photos; let i = index"
            [style.width.px]="collageWidth(p)"
            [style.--rot.deg]="collageRotate(p)"
            [style.zIndex]="collageZ(p)"
            (click)="open(i)"
          >
            <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
          </figure>
        </section>

        <!-- POLAROID WALL -->
        <section *ngSwitchCase="'polaroid'" class="polaroid">
          <figure class="cell" appReveal *ngFor="let p of g.photos; let i = index" (click)="open(i)">
            <div class="frame" [style.--rot.deg]="collageRotate(p)">
              <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
              <span class="cap">{{ p.title || p.caption || ' ' }}</span>
            </div>
          </figure>
        </section>

        <!-- FILMSTRIP -->
        <section *ngSwitchCase="'filmstrip'" class="filmstrip">
          <div class="reel">
            <figure class="frame" *ngFor="let p of g.photos; let i = index" (click)="open(i)">
              <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
            </figure>
          </div>
        </section>

        <!-- MARQUEE DRIFT -->
        <section *ngSwitchCase="'marquee'" class="marquee">
          <div class="row" *ngFor="let row of marqueeRows(g.photos); let r = index" [class.reverse]="r % 2 === 1">
            <div class="track" [style.animationDuration.s]="38 + r * 12">
              <figure *ngFor="let p of dup(row)" (click)="openPhoto(p)">
                <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.title || p.filename" loading="lazy" />
              </figure>
            </div>
          </div>
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
      .accent-rule {
        width: 64px;
        height: 4px;
        margin: 0.7rem auto 0;
        border-radius: 2px;
        background: var(--color-accent);
      }
      .head p {
        color: var(--color-muted);
        max-width: 60ch;
        margin: 0.8rem auto 0;
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

      /* ── COLLAGE / OVERLAP ── */
      .collage {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        padding: clamp(2rem, 5vw, 4rem) 0;
      }
      .collage .cell {
        margin: clamp(-2.4rem, -3vw, -1.2rem);
        transform: rotate(var(--rot)) translateY(18px);
        transition: transform 0.3s var(--ease), opacity 0.6s var(--ease);
        border-radius: var(--radius);
        overflow: hidden;
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.4);
      }
      .collage .cell.revealed {
        transform: rotate(var(--rot)) translateY(0);
      }
      .collage .cell:hover {
        transform: rotate(0deg) scale(1.07);
        z-index: 999 !important;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
      }
      .collage .cell img {
        display: block;
        width: 100%;
      }

      /* ── POLAROID WALL ── */
      .polaroid {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: flex-start;
        gap: clamp(0.6rem, 2vw, 1.6rem);
        padding: 2rem 0;
      }
      .polaroid .cell {
        width: clamp(180px, 24vw, 280px);
      }
      .polaroid .frame {
        background: #fdfdfb;
        padding: 12px 12px 0;
        border-radius: 2px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
        transform: rotate(var(--rot));
        transition: transform 0.25s var(--ease);
      }
      .polaroid .frame img {
        display: block;
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 0;
      }
      .polaroid .cap {
        display: block;
        text-align: center;
        color: #2a2a26;
        font-family: 'Caveat', cursive;
        font-size: 1.3rem;
        line-height: 1.2;
        padding: 0.45rem 0.3rem 0.7rem;
        min-height: 1.9rem;
      }
      .polaroid .cell:hover .frame {
        transform: rotate(0deg) scale(1.04);
      }

      /* ── FILMSTRIP ── */
      .filmstrip {
        overflow-x: auto;
        padding: 1rem 0 2rem;
      }
      .reel {
        position: relative;
        display: inline-flex;
        gap: 6px;
        padding: 24px 12px;
        background: #141414;
        border-radius: 4px;
      }
      .reel::before,
      .reel::after {
        content: '';
        position: absolute;
        left: 10px;
        right: 10px;
        height: 9px;
        background: repeating-linear-gradient(
          to right,
          #d9d9d9 0 9px,
          transparent 9px 21px
        );
        border-radius: 2px;
      }
      .reel::before {
        top: 7px;
      }
      .reel::after {
        bottom: 7px;
      }
      .filmstrip .frame {
        flex: 0 0 auto;
        margin: 0;
        width: clamp(220px, 40vw, 360px);
      }
      .filmstrip .frame img {
        display: block;
        width: 100%;
        height: clamp(160px, 30vh, 260px);
        object-fit: cover;
        border: 1px solid #000;
        border-radius: 0;
      }

      /* ── MARQUEE DRIFT ── */
      .marquee {
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow: hidden;
        padding: 1rem 0;
      }
      .marquee .row {
        overflow: hidden;
      }
      .marquee .track {
        display: flex;
        gap: 12px;
        width: max-content;
        animation-name: marquee-scroll;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      .marquee .row.reverse .track {
        animation-direction: reverse;
      }
      .marquee .track:hover {
        animation-play-state: paused;
      }
      @keyframes marquee-scroll {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(-50%);
        }
      }
      .marquee figure {
        flex: 0 0 auto;
        margin: 0;
        height: clamp(140px, 22vh, 220px);
      }
      .marquee figure img {
        display: block;
        height: 100%;
        width: auto;
        border-radius: var(--radius);
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

  /** Stable hash seeded by photo id, so seeded layouts don't reshuffle on
   *  re-render. */
  private hash(id: string): number {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
    return h;
  }

  /** Stable small rotation seeded by photo id (mood board + collage + polaroid). */
  rotation(p: Photo): number {
    return ((this.hash(p.id) % 11) - 5) * 0.8; // -4°..+4°
  }
  collageRotate(p: Photo): number {
    return ((this.hash(p.id + 'r') % 13) - 6) * 0.9; // -5.4°..+5.4°
  }
  /** Seeded width tier so the collage has wildly varied sizes. */
  collageWidth(p: Photo): number {
    return 170 + (this.hash(p.id + 'w') % 5) * 48; // 170..362px
  }
  /** Seeded stacking order so some photos sit in front of others. */
  collageZ(p: Photo): number {
    return 1 + (this.hash(p.id + 'z') % 20);
  }

  /** Split photos into three rows for the marquee, spread evenly. */
  marqueeRows(photos: Photo[]): Photo[][] {
    const rows: Photo[][] = [[], [], []];
    photos.forEach((p, i) => rows[i % 3].push(p));
    return rows.filter((r) => r.length > 0);
  }
  /** Duplicate a row so the marquee animation loops seamlessly. */
  dup(row: Photo[]): Photo[] {
    return [...row, ...row];
  }
  /** Open the lightbox at a photo's position in the full gallery. */
  openPhoto(p: Photo): void {
    const idx = this.gallery()?.photos.findIndex((x) => x.id === p.id) ?? -1;
    if (idx >= 0) this.lightboxIndex.set(idx);
  }
}
