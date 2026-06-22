import { Injectable, signal } from '@angular/core';

import { ForceTheme } from '../models';

type Mode = 'light' | 'dark';
const PREF_KEY = 'captionato_theme'; // 'light' | 'dark' | absent => system

/**
 * Resolves the active theme from three layers, in priority order:
 *   1. A gallery override (force light/dark + custom accent), while on a gallery
 *   2. The user's manual toggle (persisted in localStorage)
 *   3. The OS preference (prefers-color-scheme)
 *
 * The resolved mode is written to <html data-theme> and a custom accent to an
 * inline CSS variable, both consumed by styles.scss.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** The user's persisted manual choice, or null when following the system. */
  private userPref = signal<Mode | null>(this.readPref());
  /** Active gallery override, cleared when leaving a gallery page. */
  private galleryOverride: { theme: ForceTheme; accent: string | null } | null =
    null;

  readonly mode = signal<Mode>('light');

  private media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.media.addEventListener('change', () => this.apply());
    this.apply();
  }

  /** Manual toggle from the public chrome. */
  toggle(): void {
    const next: Mode = this.mode() === 'dark' ? 'light' : 'dark';
    this.userPref.set(next);
    localStorage.setItem(PREF_KEY, next);
    this.apply();
  }

  /** Called by a gallery page to apply its force-theme + accent. */
  setGalleryOverride(theme: ForceTheme, accent: string | null): void {
    this.galleryOverride = { theme, accent };
    this.apply();
  }

  /** Called when leaving a gallery page. */
  clearGalleryOverride(): void {
    this.galleryOverride = null;
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;

    // Resolve mode.
    let mode: Mode;
    if (this.galleryOverride && this.galleryOverride.theme !== 'system') {
      mode = this.galleryOverride.theme;
    } else if (this.userPref()) {
      mode = this.userPref()!;
    } else {
      mode = this.media.matches ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', mode);
    this.mode.set(mode);

    // Resolve accent (gallery override only; otherwise clear inline var so the
    // token from styles.scss wins).
    const accent = this.galleryOverride?.accent ?? null;
    if (accent) {
      root.style.setProperty('--color-accent', accent);
    } else {
      root.style.removeProperty('--color-accent');
    }
  }

  private readPref(): Mode | null {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  }
}
