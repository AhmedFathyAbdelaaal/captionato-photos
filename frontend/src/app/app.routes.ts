import { Routes } from '@angular/router';

import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'galleries',
    loadComponent: () =>
      import('./pages/galleries.component').then((m) => m.GalleriesComponent),
  },
  {
    path: 'galleries/:slug',
    loadComponent: () =>
      import('./pages/gallery-detail.component').then(
        (m) => m.GalleryDetailComponent,
      ),
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./admin/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
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
