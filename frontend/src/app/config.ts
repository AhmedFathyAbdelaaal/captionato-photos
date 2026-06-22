import { InjectionToken } from '@angular/core';

/** Resolved at runtime from /assets/config.json, which the container entrypoint
 *  renders from the API_BASE_URL env var. */
export interface AppConfig {
  apiBaseUrl: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
