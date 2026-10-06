import { Component, Input } from '@angular/core';

let nextId = 0;

/**
 * The brand's single-color capybara mark (assets/brand/marks/capybara-mark-*),
 * inlined so it takes `currentColor`. Eyes and nose are true knockouts via a
 * mask; each instance gets its own mask id so many can share a page.
 */
@Component({
  selector: 'app-capy-icon',
  standalone: true,
  template: `
    <svg
      viewBox="20 22 80 68"
      [attr.width]="size"
      [attr.height]="size"
      aria-hidden="true"
      focusable="false"
    >
      <mask [attr.id]="maskId">
        <rect x="0" y="0" width="120" height="120" fill="#000" />
        <ellipse cx="32" cy="40" rx="6" ry="7" fill="#fff" />
        <ellipse cx="88" cy="40" rx="6" ry="7" fill="#fff" />
        <rect x="23" y="38" width="74" height="48" rx="15" fill="#fff" />
        <ellipse cx="46" cy="51" rx="3.4" ry="4" fill="#000" />
        <ellipse cx="74" cy="51" rx="3.4" ry="4" fill="#000" />
        <rect x="44" y="61" width="32" height="14" rx="6" fill="#000" />
      </mask>
      <rect x="0" y="0" width="120" height="120" fill="currentColor" [attr.mask]="maskUrl" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        line-height: 0;
      }
    `,
  ],
})
export class CapyIconComponent {
  @Input() size = 20;
  readonly maskId = `capy-mask-${nextId++}`;
  readonly maskUrl = `url(#${this.maskId})`;
}
