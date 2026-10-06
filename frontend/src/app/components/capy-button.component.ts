import { Component, Input, signal } from '@angular/core';

import { Photo } from '../models';
import { ApiService } from '../services/api.service';
import { CapyIconComponent } from './capy-icon.component';

/**
 * The capybara "like". Faded when you haven't given one, solid ember with a
 * little hop when you have. Optimistic: flips instantly, then reconciles with
 * the server's count (and rolls back if the request fails). Mutates the
 * photo's capy fields so thumbnails and the lightbox stay in sync.
 */
@Component({
  selector: 'app-capy-button',
  standalone: true,
  imports: [CapyIconComponent],
  template: `
    <button
      type="button"
      class="capy"
      [class.on]="photo.capied"
      [class.hop]="hop()"
      [attr.aria-pressed]="!!photo.capied"
      [attr.aria-label]="photo.capied ? 'Take your capy back' : 'Give a capy'"
      [title]="photo.capied ? 'Take your capy back' : 'Give a capy'"
      (click)="toggle($event)"
      (animationend)="hop.set(false)"
    >
      <app-capy-icon [size]="size"></app-capy-icon>
      <span class="n mono">{{ photo.capy_count || 0 }}</span>
    </button>
  `,
  styles: [
    `
      .capy {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.3rem 0.7rem 0.3rem 0.5rem;
        color: var(--color-muted);
        cursor: pointer;
        transition: color 0.2s var(--ease), border-color 0.2s var(--ease);
      }
      .capy app-capy-icon {
        opacity: 0.45;
        transition: opacity 0.2s var(--ease);
      }
      .capy:hover app-capy-icon {
        opacity: 0.8;
      }
      .capy.on {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }
      .capy.on app-capy-icon {
        opacity: 1;
      }
      .capy.hop app-capy-icon {
        animation: hop 0.45s var(--ease);
      }
      @keyframes hop {
        30% {
          transform: translateY(-5px) scale(1.18) rotate(-6deg);
        }
        60% {
          transform: translateY(0) scale(0.94) rotate(3deg);
        }
      }
      .n {
        font-size: 0.8rem;
        color: var(--color-ink);
      }
      @media (prefers-reduced-motion: reduce) {
        .capy.hop app-capy-icon {
          animation: none;
        }
      }
    `,
  ],
})
export class CapyButtonComponent {
  @Input({ required: true }) photo!: Photo;
  /** Where the viewer sees the photo (null = portfolio) — authorises the capy. */
  @Input() galleryId: string | null = null;
  @Input() size = 20;

  hop = signal(false);
  private busy = false;

  constructor(private api: ApiService) {}

  toggle(e: Event): void {
    e.stopPropagation();
    if (this.busy) return;
    this.busy = true;
    const p = this.photo;
    const was = { capied: !!p.capied, count: p.capy_count ?? 0 };
    p.capied = !was.capied;
    p.capy_count = Math.max(0, was.count + (p.capied ? 1 : -1));
    if (p.capied) this.hop.set(true);
    const req = p.capied
      ? this.api.giveCapy(p.id, this.galleryId)
      : this.api.takeCapyBack(p.id);
    req.subscribe({
      next: (s) => {
        p.capied = s.capied;
        p.capy_count = s.capy_count;
        this.busy = false;
      },
      error: () => {
        p.capied = was.capied;
        p.capy_count = was.count;
        this.busy = false;
      },
    });
  }
}
