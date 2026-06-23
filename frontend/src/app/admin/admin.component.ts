import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin">
      <aside class="side">
        <a routerLink="/" class="brand">captionato<span>photos</span></a>
        <nav>
          <a routerLink="/admin/photos" routerLinkActive="active">Photos</a>
          <a routerLink="/admin/galleries" routerLinkActive="active">Galleries</a>
          <a routerLink="/admin/settings" routerLinkActive="active">Settings</a>
        </nav>
        <div class="foot">
          <a routerLink="/" class="view">↗ View site</a>
          <button class="btn-ghost" (click)="logout()">Sign out</button>
        </div>
      </aside>
      <section class="content">
        <router-outlet></router-outlet>
      </section>
    </div>
  `,
  styles: [
    `
      .admin {
        display: grid;
        grid-template-columns: 230px 1fr;
        min-height: 100vh;
      }
      .side {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding: 1.5rem;
        border-right: 1px solid var(--color-border);
        background: var(--color-surface);
        position: sticky;
        top: 0;
        height: 100vh;
      }
      .brand {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 1.1rem;
      }
      .brand span {
        color: var(--color-accent);
        margin-left: 0.15em;
      }
      nav {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      nav a {
        padding: 0.5rem 0.7rem;
        border-radius: var(--radius);
        color: var(--color-muted);
        font-family: var(--font-display);
      }
      nav a:hover {
        color: var(--color-ink);
      }
      nav a.active {
        background: var(--color-paper);
        color: var(--color-accent);
      }
      .foot {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        font-size: 0.9rem;
      }
      .view {
        color: var(--color-muted);
      }
      .content {
        padding: clamp(1.2rem, 3vw, 2.5rem);
        overflow: auto;
      }
      @media (max-width: 720px) {
        .admin {
          grid-template-columns: 1fr;
        }
        .side {
          position: sticky;
          top: 0;
          z-index: 30;
          height: auto;
          flex-direction: row;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.6rem 1rem;
          padding: 0.8rem 1rem;
        }
        .brand {
          flex: 1 1 auto;
        }
        nav {
          flex-direction: row;
          order: 3;
          flex-basis: 100%;
          overflow-x: auto;
        }
        nav a {
          white-space: nowrap;
        }
        .foot {
          margin: 0;
          flex-direction: row;
          align-items: center;
          gap: 0.6rem;
        }
        .foot .view {
          display: none; /* keep the bar compact on phones */
        }
      }
    `,
  ],
})
export class AdminComponent {
  constructor(private auth: AuthService, private router: Router) {}

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/admin/login']);
  }
}
