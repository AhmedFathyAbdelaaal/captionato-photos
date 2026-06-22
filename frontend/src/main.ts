import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { APP_CONFIG, AppConfig } from './app/config';

// Load runtime config (rendered from env vars by the container entrypoint)
// before bootstrapping, so the API URL is available via DI everywhere.
fetch('assets/config.json')
  .then((r) => r.json())
  .then((cfg: AppConfig) => {
    bootstrapApplication(AppComponent, {
      ...appConfig,
      providers: [...appConfig.providers, { provide: APP_CONFIG, useValue: cfg }],
    }).catch((err) => console.error(err));
  })
  .catch((err) =>
    console.error('Failed to load runtime config (assets/config.json)', err),
  );
