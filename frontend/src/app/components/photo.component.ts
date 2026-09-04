import { CommonModule } from '@angular/common';
import { Component, Input, signal } from '@angular/core';

/**
 * A single image that reserves its space and shows a warm shimmer until it
 * loads, then fades in. Sizing has two modes:
 *
 *  - `fit="cover"` (default): the image fills its host box (the parent gives the
 *    box a size or aspect-ratio) and is cropped to cover. Use for cards, grids,
 *    gallery covers.
 *  - `fit="natural"`: the wrapper takes the photo's own aspect-ratio (from
 *    width/height, falling back to `ratioFallback`) and the image keeps its
 *    proportions. Use for masonry / editorial columns.
 *
 * Hover-zoom: parents can't reach into the encapsulated <img>, so the zoom is
 * driven by the inherited custom property `--photo-scale` — set it on hover
 * from the parent (e.g. `.card:hover { --photo-scale: 1.05 }`).
 */
@Component({
  selector: 'app-photo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="ph"
      [class.natural]="fit === 'natural'"
      [class.loaded]="loaded()"
      [style.aspectRatio]="fit === 'natural' ? ratio() : null"
    >
      <img
        [src]="src"
        [alt]="alt"
        [attr.loading]="eager ? 'eager' : 'lazy'"
        [attr.decoding]="'async'"
        draggable="false"
        (load)="loaded.set(true)"
        (error)="loaded.set(true)"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .ph {
        position: relative;
        overflow: hidden;
        width: 100%;
        height: 100%;
        border-radius: var(--photo-radius, var(--radius));
        background: var(--color-surface);
      }
      .ph.natural {
        height: auto;
      }
      /* Warm shimmer sweep while loading; removed once the image is in. */
      .ph::after {
        content: '';
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(
          90deg,
          transparent,
          color-mix(in srgb, var(--cap-capy, #9a6a45) 18%, transparent),
          transparent
        );
        animation: photo-shimmer 1.4s infinite;
      }
      .ph.loaded::after {
        display: none;
      }
      @keyframes photo-shimmer {
        100% {
          transform: translateX(100%);
        }
      }
      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: inherit;
        opacity: 0;
        transform: scale(var(--photo-scale, 1));
        transition: opacity 0.5s var(--ease, ease),
          transform 0.5s var(--ease, ease);
      }
      .ph.natural img {
        height: auto;
      }
      .ph.loaded img {
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .ph::after {
          animation: none;
        }
        img {
          transition: opacity 0.2s linear;
        }
      }
    `,
  ],
})
export class PhotoComponent {
  @Input({ required: true }) src!: string;
  @Input() alt = '';
  @Input() fit: 'cover' | 'natural' = 'cover';
  @Input() width?: number | null;
  @Input() height?: number | null;
  @Input() eager = false;
  @Input() ratioFallback = '3 / 4';

  loaded = signal(false);

  ratio(): string {
    return this.width && this.height
      ? `${this.width} / ${this.height}`
      : this.ratioFallback;
  }
}
