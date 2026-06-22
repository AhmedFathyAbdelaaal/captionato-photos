import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Gallery } from '../models';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-galleries',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="wrap">
      <header class="head">
        <h1>Galleries</h1>
        <p>Curated collections, each with its own character.</p>
      </header>

      <div class="grid">
        <a
          class="card"
          *ngFor="let g of galleries()"
          [routerLink]="['/galleries', g.slug]"
          [style.--accent]="g.accent_color || 'var(--color-accent)'"
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
            </div>
          </div>
          <div class="meta">
            <span class="name">{{ g.name }}</span>
            <span class="count mono">{{ g.photo_count }} photo{{ g.photo_count === 1 ? '' : 's' }}</span>
          </div>
          <p class="desc" *ngIf="g.description">{{ g.description }}</p>
        </a>
      </div>

      <p class="hint" *ngIf="!loading() && galleries().length === 0">
        No galleries yet.
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
      .head h1 {
        font-size: clamp(2rem, 5vw, 3rem);
      }
      .head p {
        color: var(--color-muted);
        margin-top: -0.4rem;
      }
      .grid {
        margin-top: 2.5rem;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: clamp(1.2rem, 3vw, 2rem);
      }
      .card {
        display: block;
      }
      .cover {
        position: relative;
        aspect-ratio: 4 / 3;
        overflow: hidden;
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s var(--ease);
      }
      .card:hover .cover img {
        transform: scale(1.05);
      }
      .overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--accent) 70%, transparent);
        opacity: 0;
        transition: opacity 0.3s var(--ease);
      }
      .card:hover .overlay {
        opacity: 1;
      }
      .overlay h2 {
        color: #fff;
        font-size: 1.6rem;
        margin: 0;
      }
      .meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-top: 0.7rem;
      }
      .name {
        font-family: var(--font-display);
        font-weight: 600;
      }
      .count {
        color: var(--color-muted);
        font-size: 0.8rem;
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
}
