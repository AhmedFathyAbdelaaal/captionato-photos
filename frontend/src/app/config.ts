import { InjectionToken } from '@angular/core';

/** Resolved at runtime from /assets/config.json, which the container entrypoint
 *  renders from the API_BASE_URL / TURNSTILE_SITE_KEY env vars. */
export interface AppConfig {
  apiBaseUrl: string;
  /** Cloudflare Turnstile site key. Empty = no captcha widget (local dev). */
  turnstileSiteKey?: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
