import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

import { Photo } from '../models';
import { CapyIconComponent } from './capy-icon.component';

/** Tiny overlay for a thumbnail: capys + comments, only when there are any.
 *  The host cell must be position: relative. */
@Component({
  selector: 'app-photo-stats',
  standalone: true,
  imports: [NgIf, CapyIconComponent],
  template: `
    <span class="stats" *ngIf="photo.capy_count || photo.comment_count">
      <span *ngIf="photo.capy_count" [class.mine]="photo.capied">
        <app-capy-icon [size]="12"></app-capy-icon>{{ photo.capy_count }}
      </span>
      <span *ngIf="photo.comment_count">💬{{ photo.comment_count }}</span>
    </span>
  `,
  styles: [
    `
      :host {
        position: absolute;
        left: 0.45rem;
        bottom: 0.45rem;
        z-index: 2;
        pointer-events: none;
      }
      .stats {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.2rem 0.5rem;
        border-radius: 999px;
        background: rgba(20, 17, 16, 0.62);
        backdrop-filter: blur(4px);
        color: #faf3e6;
        font-family: var(--font-mono);
        font-size: 0.7rem;
        line-height: 1;
      }
      .stats > span {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }
      .mine {
        color: #ef5a4e;
      }
    `,
  ],
})
export class PhotoStatsComponent {
  @Input({ required: true }) photo!: Photo;
}
