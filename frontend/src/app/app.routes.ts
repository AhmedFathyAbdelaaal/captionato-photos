import { Routes } from '@angular/router';

import {
  adminGuard,
  approvedGuard,
  guestGuard,
  portfolioGuard,
} from './services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    data: { mode: 'login' },
    loadComponent: () =>
      import('./pages/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    data: { mode: 'register' },
    loadComponent: () =>
      import('./pages/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: 'portfolio',
    canActivate: [portfolioGuard],
    loadComponent: () =>
      import('./pages/portfolio.component').then((m) => m.PortfolioComponent),
  },
  {
    path: 'galleries',
    canActivate: [approvedGuard],
    loadComponent: () =>
      import('./pages/galleries.component').then((m) => m.GalleriesComponent),
  },
  {
    path: 'galleries/:slug',
    canActivate: [approvedGuard],
    loadComponent: () =>
      import('./pages/gallery-detail.component').then(
        (m) => m.GalleryDetailComponent,
      ),
  },
  // Old admin login URL — everyone signs in through /login now.
  { path: 'admin/login', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./admin/admin.component').then((m) => m.AdminComponent),
    children: [
      { path: '', redirectTo: 'photos', pathMatch: 'full' },
      {
        path: 'photos',
        loadComponent: () =>
          import('./admin/admin-photos.component').then(
            (m) => m.AdminPhotosComponent,
          ),
      },
      {
        path: 'galleries',
        loadComponent: () =>
          import('./admin/admin-galleries.component').then(
            (m) => m.AdminGalleriesComponent,
          ),
      },
      {
        path: 'galleries/:id',
        loadComponent: () =>
          import('./admin/gallery-editor.component').then(
            (m) => m.GalleryEditorComponent,
          ),
      },
      {
        path: 'collages',
        loadComponent: () =>
          import('./admin/admin-collages.component').then(
            (m) => m.AdminCollagesComponent,
          ),
      },
      {
        path: 'collages/:id',
        loadComponent: () =>
          import('./admin/collage-editor.component').then(
            (m) => m.CollageEditorComponent,
          ),
      },
      {
        path: 'posts',
        loadComponent: () =>
          import('./admin/admin-posts.component').then(
            (m) => m.AdminPostsComponent,
          ),
      },
      {
        path: 'posts/:id',
        loadComponent: () =>
          import('./admin/post-editor.component').then(
            (m) => m.PostEditorComponent,
          ),
      },
      {
        path: 'comments',
        loadComponent: () =>
          import('./admin/admin-comments.component').then(
            (m) => m.AdminCommentsComponent,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./admin/admin-users.component').then(
            (m) => m.AdminUsersComponent,
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./admin/admin-settings.component').then(
            (m) => m.AdminSettingsComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
