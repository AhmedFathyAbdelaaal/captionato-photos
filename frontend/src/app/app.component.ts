import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from './services/auth.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="chrome" *ngIf="showChrome()">
      <a routerLink="/" class="brand" aria-label="Captionato Photos — home">
        <img
          class="mark"
          [src]="theme.mode() === 'dark' ? 'assets/brand/marks/capybara-mark-cream.svg' : 'assets/brand/marks/capybara-mark-ink.svg'"
          alt=""
          width="28"
          height="28"
        />
        <span class="wordmark">captionato<span class="rule">photos</span></span>
      </a>
      <nav>
        <a *ngIf="auth.canSeePortfolio()" routerLink="/portfolio" routerLinkActive="active">portfolio</a>
        <a *ngIf="auth.galleries().length" routerLink="/galleries" routerLinkActive="active">galleries</a>
        <a *ngIf="auth.isAdmin()" routerLink="/admin">admin</a>
        <ng-container *ngIf="!auth.isLoggedIn()">
          <a routerLink="/login" routerLinkActive="active">log in</a>
          <a routerLink="/register" class="pill">register</a>
        </ng-container>
        <button
          *ngIf="auth.isLoggedIn()"
          class="linkish"
          (click)="logout()"
          [title]="'Signed in as ' + auth.me()?.username"
        >
          log out
        </button>
        <button class="toggle" (click)="theme.toggle()" [attr.aria-label]="'Toggle theme'">
          {{ theme.mode() === 'dark' ? '☾' : '☀' }}
        </button>
      </nav>
    </header>

    <main><router-outlet></router-outlet></main>
  `,
  styles: [
    `
      .chrome {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem clamp(1rem, 4vw, 3rem);
        background: color-mix(in srgb, var(--color-paper) 88%, transparent);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--color-border);
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
      }
      .brand .mark {
        display: block;
        width: 28px;
        height: 28px;
      }
      .brand .wordmark {
        font-family: var(--font-display);
        font-weight: 800;
        font-size: 1.15rem;
        letter-spacing: -0.03em;
      }
      .brand .rule {
        color: var(--color-accent);
        margin-left: 0.15em;
      }
      nav {
        display: flex;
        align-items: center;
        gap: 1.4rem;
        font-family: var(--font-display);
        font-size: 0.95rem;
      }
      nav a {
        color: var(--color-muted);
        transition: color 0.2s var(--ease);
      }
      nav a:hover,
      nav a.active {
        color: var(--color-ink);
      }
      .pill {
        color: var(--color-paper);
        background: var(--color-accent);
        padding: 0.3rem 0.8rem;
        border-radius: 999px;
      }
      nav a.pill:hover {
        color: var(--color-paper);
      }
      .linkish {
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        color: var(--color-muted);
        cursor: pointer;
      }
      .linkish:hover {
        color: var(--color-ink);
      }
      @media (max-width: 480px) {
        nav {
          gap: 0.85rem;
          font-size: 0.88rem;
        }
        .brand .wordmark {
          display: none;
        }
      }
      .toggle {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 50%;
        width: 2.1rem;
        height: 2.1rem;
        font-size: 1rem;
        color: var(--color-ink);
        display: grid;
        place-items: center;
      }
    `,
  ],
})
export class AppComponent {
  private url = signal(this.router.url);
  /** Public chrome is hidden inside the admin area (it has its own layout). */
  showChrome = computed(() => !this.url().startsWith('/admin'));

  constructor(
    private router: Router,
    public theme: ThemeService,
    public auth: AuthService,
  ) {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
