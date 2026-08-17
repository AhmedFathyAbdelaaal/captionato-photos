import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Gallery, Photo } from '../models';
import { ApiService } from '../services/api.service';
import { LightboxComponent } from '../components/lightbox.component';

/** One scattered slot in the hero: position (% of hero), width (vw), depth
 *  (0 = far/slow/soft, 1 = near/fast/sharp) and a small resting tilt. */
interface Slot {
  x: number;
  y: number;
  w: number;
  d: number;
  r: number;
}

const SLOTS: Slot[] = [
  { x: -3, y: 4, w: 21, d: 0.95, r: -3 },
  { x: 75, y: -5, w: 19, d: 0.7, r: 2.5 },
  { x: 40, y: -7, w: 13, d: 0.3, r: -1.5 },
  { x: 84, y: 30, w: 16, d: 1.0, r: 3 },
  { x: -7, y: 50, w: 17, d: 0.6, r: 2 },
  { x: 68, y: 64, w: 21, d: 0.88, r: -2.5 },
  { x: 7, y: 72, w: 15, d: 0.5, r: -3 },
  { x: 37, y: 80, w: 12, d: 0.28, r: 1.5 },
  { x: 22, y: 28, w: 11, d: 0.22, r: 2 },
  { x: 58, y: 20, w: 10, d: 0.2, r: -2 },
  { x: 90, y: 76, w: 13, d: 0.55, r: 2.5 },
  { x: -9, y: 24, w: 13, d: 0.78, r: -2 },
];

/**
 * Landing: a parallax-scatter hero of the most recent work (photos drift on
 * scroll + mouse across depth layers), a selection of public galleries, and a
 * big call-to-action into the full portfolio.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, LightboxComponent],
  template: `
    <!-- ── Parallax scatter hero ── -->
    <section class="hero" #hero>
      <div class="scatter-wrap">
        <figure
          class="scatter"
          *ngFor="let photo of scattered(); let i = index"
          [style.left.%]="slots[i].x"
          [style.top.%]="slots[i].y"
          [style.width.vw]="slots[i].w"
          [style.--d]="slots[i].d"
          [style.--r.deg]="slots[i].r"
          [style.zIndex]="zFor(slots[i].d)"
          (click)="open(i)"
        >
          <img [src]="api.imageUrl(photo.thumbnail_url)" [alt]="photo.title || photo.filename" />
        </figure>
      </div>

      <div class="hero-copy">
        <span class="eyebrow mono" *ngIf="latestLabel()">Latest · {{ latestLabel() }}</span>
        <h1>captionato<span>photos</span></h1>
        <p>A living archive — moments caught and kept, newest first.</p>
        <a class="scroll-cue" (click)="scrollDown()">
          <span>explore</span>
          <span class="chev">⌄</span>
        </a>
      </div>
    </section>

    <!-- ── Galleries selection ── -->
    <section class="galleries" *ngIf="galleries().length">
      <header class="sec-head">
        <h2>Galleries</h2>
        <a routerLink="/galleries" class="see-all">see all →</a>
      </header>
      <div class="gal-grid">
        <a
          class="gal"
          *ngFor="let g of galleries()"
          [routerLink]="['/galleries', g.slug]"
          [style.--accent]="g.accent_color || 'var(--color-accent)'"
        >
          <div class="gal-cover">
            <img *ngIf="g.cover_thumbnail_url" [src]="api.imageUrl(g.cover_thumbnail_url)" [alt]="g.name" loading="lazy" />
            <div class="gal-overlay"><span>{{ g.name }}</span></div>
          </div>
          <div class="gal-meta">
            <span class="gal-name">{{ g.name }}</span>
            <span class="mono muted">{{ g.photo_count }}</span>
          </div>
        </a>
      </div>
    </section>

    <!-- ── Portfolio CTA ── -->
    <section class="cta-wrap">
      <a routerLink="/portfolio" class="cta">
        <span class="cta-sub mono">{{ total() ? total() + ' photographs' : 'the full archive' }}</span>
        <span class="cta-main">View the full portfolio <span class="arr">→</span></span>
      </a>
    </section>

    <app-lightbox
      *ngIf="lightboxIndex() !== null"
      [photos]="scattered()"
      [index]="lightboxIndex()!"
      (close)="lightboxIndex.set(null)"
    ></app-lightbox>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      /* ── Hero ── */
      .hero {
        position: relative;
        height: clamp(560px, 90svh, 940px);
        overflow: hidden;
        --sy: 0px;
        --mx: 0px;
        --my: 0px;
      }
      .scatter-wrap {
        position: absolute;
        inset: 0;
      }
      .scatter {
        position: absolute;
        margin: 0;
        cursor: pointer;
        transform: translate3d(
            calc(var(--mx) * var(--d)),
            calc(var(--sy) * var(--d) + var(--my) * var(--d)),
            0
          )
          rotate(var(--r));
        transition: transform 0.18s ease-out, filter 0.4s var(--ease);
        will-change: transform;
      }
      .scatter img {
        display: block;
        width: 100%;
        height: auto;
        border-radius: var(--radius);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
        /* Depth cue: far photos are softer + dimmer, near ones sharp. */
        filter: blur(calc((1 - var(--d)) * 1.6px));
        opacity: calc(0.5 + var(--d) * 0.5);
        transition: transform 0.5s var(--ease);
      }
      .scatter:hover {
        z-index: 60 !important;
      }
      .scatter:hover img {
        transform: scale(1.04);
        filter: none;
        opacity: 1;
      }
      .hero-copy {
        position: absolute;
        inset: 0;
        z-index: 50;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 0.5rem;
        padding: 1rem;
        pointer-events: none;
        /* Radial scrim so the title stays legible over the scatter. */
        background: radial-gradient(
          ellipse 60% 45% at 50% 45%,
          color-mix(in srgb, var(--color-paper) 78%, transparent),
          transparent 75%
        );
      }
      .eyebrow {
        font-size: 0.8rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--color-accent);
      }
      .hero-copy h1 {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: clamp(2.6rem, 9vw, 6rem);
        line-height: 0.95;
        letter-spacing: -0.03em;
        margin: 0;
      }
      .hero-copy h1 span {
        color: var(--color-accent);
      }
      .hero-copy p {
        color: var(--color-muted);
        max-width: 34ch;
        margin: 0.4rem 0 0;
      }
      .scroll-cue {
        pointer-events: auto;
        cursor: pointer;
        margin-top: 1.4rem;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1rem;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--color-muted);
      }
      .scroll-cue .chev {
        font-size: 1.3rem;
        line-height: 1;
        animation: bob 1.8s ease-in-out infinite;
      }
      @keyframes bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(4px); }
      }

      /* ── Galleries ── */
      .galleries {
        max-width: var(--max-width);
        margin: clamp(2.5rem, 6vw, 5rem) auto 0;
        padding: 0 clamp(1rem, 4vw, 3rem);
      }
      .sec-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 1.4rem;
      }
      .sec-head h2 {
        font-family: var(--font-display);
        font-size: clamp(1.5rem, 4vw, 2.2rem);
        margin: 0;
      }
      .see-all {
        color: var(--color-muted);
        font-size: 0.9rem;
      }
      .see-all:hover {
        color: var(--color-accent);
      }
      .gal-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: clamp(1rem, 2.5vw, 1.6rem);
      }
      .gal {
        display: block;
      }
      .gal-cover {
        position: relative;
        aspect-ratio: 4 / 3;
        overflow: hidden;
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      .gal-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s var(--ease);
      }
      .gal:hover .gal-cover img {
        transform: scale(1.05);
      }
      .gal-overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--accent) 66%, transparent);
        opacity: 0;
        transition: opacity 0.3s var(--ease);
      }
      .gal:hover .gal-overlay {
        opacity: 1;
      }
      .gal-overlay span {
        color: #fff;
        font-family: var(--font-display);
        font-size: 1.4rem;
      }
      .gal-meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-top: 0.6rem;
      }
      .gal-name {
        font-family: var(--font-display);
        font-weight: 600;
      }
      .muted {
        color: var(--color-muted);
      }

      /* ── CTA ── */
      .cta-wrap {
        padding: clamp(3rem, 8vw, 6rem) clamp(1rem, 4vw, 3rem);
        display: grid;
        place-items: center;
      }
      .cta {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        padding: clamp(1.6rem, 4vw, 2.6rem) clamp(2rem, 6vw, 4rem);
        border: 1px solid var(--color-border);
        border-radius: calc(var(--radius) * 2);
        background: var(--color-surface);
        text-align: center;
        transition: border-color 0.25s var(--ease), transform 0.25s var(--ease);
      }
      .cta:hover {
        border-color: var(--color-accent);
        transform: translateY(-3px);
      }
      .cta-sub {
        font-size: 0.8rem;
        color: var(--color-muted);
        letter-spacing: 0.08em;
      }
      .cta-main {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: clamp(1.4rem, 4vw, 2.4rem);
      }
      .cta .arr {
        color: var(--color-accent);
        display: inline-block;
        transition: transform 0.25s var(--ease);
      }
      .cta:hover .arr {
        transform: translateX(6px);
      }

      @media (prefers-reduced-motion: reduce) {
        .scatter,
        .scatter img,
        .chev,
        .cta,
        .cta .arr {
          transition: none;
          animation: none;
        }
      }
    `,
  ],
})
export class LandingComponent implements OnInit {
  @ViewChild('hero') heroRef?: ElementRef<HTMLElement>;

  recents = signal<Photo[]>([]);
  galleries = signal<Gallery[]>([]);
  total = signal(0);
  lightboxIndex = signal<number | null>(null);

  slots = SLOTS;
  private mx = 0;
  private my = 0;
  private ticking = false;
  private readonly motionOk =
    typeof window === 'undefined' ||
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  private readonly MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /** Only place as many photos as we have slots (and vice versa). */
  scattered = computed(() => this.recents().slice(0, SLOTS.length));

  latestLabel = computed(() => {
    const p = this.recents()[0];
    if (!p) return '';
    const d = new Date(p.taken_at ?? p.uploaded_at);
    return `${this.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    this.api.getPhotos(1, SLOTS.length).subscribe({
      next: (res) => {
        this.recents.set(res.items);
        this.total.set(res.total);
      },
    });
    this.api.getGalleries().subscribe({
      next: (g) => this.galleries.set(g.slice(0, 6)),
    });
  }

  /** Near photos sit in front of far ones. */
  zFor(depth: number): number {
    return 10 + Math.round(depth * 30);
  }

  open(i: number): void {
    this.lightboxIndex.set(i);
  }

  scrollDown(): void {
    const h = this.heroRef?.nativeElement.offsetHeight ?? window.innerHeight;
    window.scrollTo({ top: h - 60, behavior: 'smooth' });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.schedule();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.motionOk) return;
    this.mx = (e.clientX / window.innerWidth - 0.5) * 42;
    this.my = (e.clientY / window.innerHeight - 0.5) * 42;
    this.schedule();
  }

  private schedule(): void {
    if (this.ticking || !this.motionOk) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      const el = this.heroRef?.nativeElement;
      if (el) {
        el.style.setProperty('--sy', `${-window.scrollY * 0.14}px`);
        el.style.setProperty('--mx', `${this.mx}px`);
        el.style.setProperty('--my', `${this.my}px`);
      }
      this.ticking = false;
    });
  }
}
