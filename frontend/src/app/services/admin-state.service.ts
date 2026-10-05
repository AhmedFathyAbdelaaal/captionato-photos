import { Injectable, signal } from '@angular/core';

import { ApiService } from './api.service';

/** Small bits of admin-panel state shared between the shell and its tabs. */
@Injectable({ providedIn: 'root' })
export class AdminStateService {
  /** Users awaiting approval — drives the badge on the Users nav item. */
  readonly pendingCount = signal(0);

  constructor(private api: ApiService) {}

  refreshPending(): void {
    this.api.getUsers().subscribe({
      next: (users) =>
        this.pendingCount.set(users.filter((u) => u.role === 'pending').length),
    });
  }
}
