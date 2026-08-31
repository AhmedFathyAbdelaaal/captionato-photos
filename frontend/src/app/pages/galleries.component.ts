import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Gallery } from '../models';
import { ApiService } from '../services/api.service';
import { RevealDirective } from '../components/reveal.directive';

@Component({
  selector: 'app-galleries',
  standalone: true,
  imports: [CommonModule, RouterLink, RevealDirective],
  template: `
    <div class="wrap">
      <header class="head" appReveal>
        <span class="kicker mono">CAP-GAL · Curated collections</span>
        <h1>Galleries</h1>
        <div class="head-rule"></div>
        <p>Small worlds, each with its own character.</p>
      </header>

      <div class="grid">
        <a
          class="card"
          appReveal
          *ngFor="let g of galleries(); let i = index"
          [routerLink]="['/galleries', g.slug]"
          [style.--accent]="g.accent_color || 'var(--color-accent)'"
          [style.--reveal-delay]="revealDelay(i)"
        >
          <div class="cover">
            <img
              *ngIf="g.cover_thumbnail_url"
              [src]="api.imageUrl(g.cover_thumbnail_url)"
              [alt]="g.name"
              loading="lazy"
            />
            <div class="overlay">
              <h2>{{ g.name }}</h2>
              <span class="mono">{{ g.photo_count }} · view →</span>
            </div>
          </div>
          <div class="meta">
            <span class="name">{{ g.name }}</span>
            <span class="count mono">{{ g.photo_count }}</span>
          </div>
          <p class="desc" *ngIf="g.description">{{ g.description }}</p>
        </a>
      </div>

      <p class="hint" *ngIf="!loading() && galleries().length === 0">
        No galleries here yet — check back soon.
      </p>
    </div>
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
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.6s var(--ease), transform 0.6s var(--ease);
      }
      .head.revealed {
        opacity: 1;
        transform: none;
      }
      .kicker {
        font-size: 0.72rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--color-muted);
      }
      .head h1 {
        font-family: var(--font-display);
        font-weight: 800;
        letter-spacing: -0.04em;
        font-size: clamp(2rem, 5vw, 3rem);
        margin: 0.4rem 0 0;
      }
      .head-rule {
        width: 46px;
        height: 3px;
        margin: 0.8rem auto 0;
        border-radius: 2px;
        background: var(--color-accent);
      }
      .head p {
        color: var(--color-muted);
        max-width: 44ch;
        margin: 0.9rem auto 0;
      }

      .grid {
        margin-top: clamp(2rem, 4vw, 3rem);
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: clamp(1.2rem, 3vw, 2rem);
      }
      .card {
        display: block;
        opacity: 0;
        transform: translateY(18px);
        transition: opacity 0.7s var(--ease), transform 0.7s var(--ease);
        transition-delay: var(--reveal-delay, 0s);
      }
      .card.revealed {
        opacity: 1;
        transform: none;
      }
      .cover {
        position: relative;
        aspect-ratio: 4 / 3;
        overflow: hidden;
        border-radius: var(--radius);
        background: var(--color-surface);
        box-shadow: 0 24px 40px -28px rgba(20, 17, 16, 0.45);
        transition: box-shadow 0.4s var(--ease);
      }
      .card:hover .cover {
        box-shadow: 0 32px 60px -28px rgba(20, 17, 16, 0.55);
      }
      .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.7s var(--ease), filter 0.5s var(--ease);
      }
      .card:hover .cover img {
        transform: scale(1.06);
        filter: saturate(1.08);
      }
      .overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        background: color-mix(in srgb, var(--accent) 74%, transparent);
        opacity: 0;
        transition: opacity 0.35s var(--ease);
      }
      .card:hover .overlay {
        opacity: 1;
      }
      .overlay h2 {
        color: var(--cap-cream-hi);
        font-family: var(--font-display);
        font-weight: 800;
        letter-spacing: -0.03em;
        font-size: clamp(1.4rem, 3vw, 1.8rem);
        margin: 0;
      }
      .overlay .mono {
        color: var(--cap-cream-hi);
        font-size: 0.75rem;
        letter-spacing: 0.1em;
        opacity: 0.9;
      }
      .meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-top: 0.7rem;
      }
      .name {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .count {
        color: var(--color-muted);
        font-size: 0.78rem;
      }
      .desc {
        color: var(--color-muted);
        font-size: 0.9rem;
        margin: 0.2rem 0 0;
      }
      .hint {
        text-align: center;
        color: var(--color-muted);
        font-family: var(--font-mono);
        padding: 3rem;
      }

      @media (prefers-reduced-motion: reduce) {
        .head,
        .card {
          opacity: 1;
          transform: none;
          transition: none;
        }
        .card:hover .cover img {
          transform: none;
        }
      }
    `,
  ],
})
export class GalleriesComponent implements OnInit {
  galleries = signal<Gallery[]>([]);
  loading = signal(true);

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    this.api.getGalleries().subscribe({
      next: (g) => {
        this.galleries.set(g);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Small staggered entrance so the row doesn't pop in as one flat wave. */
  revealDelay(i: number): string {
    return `${Math.min(i * 60, 480)}ms`;
  }
}
