import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';

import { Collage } from '../models';
import { ApiService } from '../services/api.service';

/** CSS aspect-ratio per format — mirrors the editor + backend renderer. */
const CANVAS_ASPECT: Record<string, string> = {
  story: '9 / 16',
  post: '1 / 1',
  square: '1 / 1',
  portrait: '4 / 5',
  landscape: '1080 / 566',
};

/**
 * A non-interactive, scaled render of one slide (a Collage), using the exact
 * same normalized geometry as the editor canvas. Fills its host box; the parent
 * controls the width. Used for the slide rail and the side-by-side preview.
 */
@Component({
  selector: 'app-slide-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="sp"
      [style.aspectRatio]="aspect()"
      [style.background]="slide.background_color"
    >
      <div
        class="lyr"
        *ngFor="let l of ordered()"
        [style.left.%]="l.pos_x * 100"
        [style.top.%]="l.pos_y * 100"
        [style.width.%]="l.width * 100"
        [style.height.%]="l.height * 100"
        [style.transform]="'rotate(' + l.rotation + 'deg)'"
        [style.zIndex]="l.z_index"
        [class.bordered]="l.border_enabled"
      >
        <div class="clip">
          <img
            [src]="api.imageUrl(l.thumb_url)"
            [style.width.%]="100 / l.crop_width"
            [style.height.%]="100 / l.crop_height"
            [style.left.%]="(-l.crop_x / l.crop_width) * 100"
            [style.top.%]="(-l.crop_y / l.crop_height) * 100"
            alt=""
            draggable="false"
            loading="lazy"
          />
        </div>
      </div>
      <div class="empty" *ngIf="ordered().length === 0">empty</div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .sp {
        position: relative;
        width: 100%;
        overflow: hidden;
        border-radius: var(--radius);
      }
      .lyr {
        position: absolute;
      }
      .clip {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      .lyr.bordered .clip {
        outline: 2px solid #d6362b;
        outline-offset: -1px;
      }
      img {
        position: absolute;
        max-width: none;
        display: block;
      }
      .empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-family: var(--font-mono);
        font-size: 0.7rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--color-muted);
      }
    `,
  ],
})
export class SlidePreviewComponent {
  private slideSig = signal<Collage | null>(null);
  @Input({ required: true }) set slide(v: Collage) {
    this.slideSig.set(v);
  }
  get slide(): Collage {
    return this.slideSig()!;
  }

  ordered = computed(() =>
    [...(this.slideSig()?.layers ?? [])].sort((a, b) => a.z_index - b.z_index),
  );
  aspect = computed(
    () => CANVAS_ASPECT[this.slideSig()?.format ?? 'square'] ?? '1 / 1',
  );

  constructor(public api: ApiService) {}
}
