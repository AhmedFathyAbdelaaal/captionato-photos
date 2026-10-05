import { NgIf } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';

import { APP_CONFIG, AppConfig } from '../config';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoad: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page, shared by every widget. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
    s.onerror = () => {
      scriptLoad = null; // allow a retry on the next mount
      reject();
    };
    document.head.appendChild(s);
  });
  return scriptLoad;
}

/**
 * Cloudflare Turnstile widget. Emits the token when solved and null when it
 * expires or errors. With no site key configured (local dev) it renders
 * nothing and immediately emits '' so forms aren't blocked — the backend skips
 * verification in that setup too.
 */
@Component({
  selector: 'app-turnstile',
  standalone: true,
  imports: [NgIf],
  template: `<div #box class="ts"></div>
    <p class="ts-err" *ngIf="failed">Couldn't load the captcha — check your connection and reload.</p>`,
  styles: [
    `
      :host { display: block; }
      .ts { min-height: 0; display: flex; justify-content: center; }
      .ts-err { color: var(--color-accent); font-size: 0.8rem; margin: 0.3rem 0 0; }
    `,
  ],
})
export class TurnstileComponent implements AfterViewInit, OnDestroy {
  @ViewChild('box') box!: ElementRef<HTMLElement>;
  @Output() token = new EventEmitter<string | null>();
  failed = false;

  private widgetId: string | null = null;
  private readonly siteKey: string;

  constructor(@Inject(APP_CONFIG) cfg: AppConfig, private zone: NgZone) {
    this.siteKey = cfg.turnstileSiteKey ?? '';
  }

  ngAfterViewInit(): void {
    if (!this.siteKey) {
      queueMicrotask(() => this.token.emit(''));
      return;
    }
    loadTurnstile().then(
      (ts) => {
        this.widgetId = ts.render(this.box.nativeElement, {
          sitekey: this.siteKey,
          theme: 'auto',
          callback: (t: string) => this.zone.run(() => this.token.emit(t)),
          'expired-callback': () => this.zone.run(() => this.token.emit(null)),
          'error-callback': () => this.zone.run(() => this.token.emit(null)),
        });
      },
      () => this.zone.run(() => (this.failed = true)),
    );
  }

  /** Tokens are single-use: call after every submit attempt that failed. */
  reset(): void {
    if (this.widgetId && window.turnstile) {
      window.turnstile.reset(this.widgetId);
      this.token.emit(null);
    }
  }

  ngOnDestroy(): void {
    if (this.widgetId && window.turnstile) window.turnstile.remove(this.widgetId);
  }
}
