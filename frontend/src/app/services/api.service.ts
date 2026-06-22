import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG, AppConfig } from '../config';
import {
  Gallery,
  GalleryDetail,
  GalleryInput,
  Photo,
  PhotoPage,
} from '../models';

/** Thin typed wrapper over the Captionato Photos API. The base URL comes from
 *  runtime config; the JWT is attached by the HTTP interceptor. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly base: string;

  constructor(private http: HttpClient, @Inject(APP_CONFIG) cfg: AppConfig) {
    this.base = cfg.apiBaseUrl.replace(/\/$/, '');
  }

  /** Turn an API-relative image path (e.g. /photos/x/thumb) into an absolute URL. */
  imageUrl(path: string): string {
    return path.startsWith('http') ? path : `${this.base}${path}`;
  }

  // ── Auth ──
  login(username: string, password: string): Observable<{ access_token: string }> {
    return this.http.post<{ access_token: string }>(`${this.base}/auth/login`, {
      username,
      password,
    });
  }
  changePassword(current_password: string, new_password: string) {
    return this.http.post(`${this.base}/auth/password`, {
      current_password,
      new_password,
    });
  }

  // ── Photos (public) ──
  getPhotos(page = 1, pageSize = 60): Observable<PhotoPage> {
    return this.http.get<PhotoPage>(
      `${this.base}/photos?page=${page}&page_size=${pageSize}`,
    );
  }
  getExif(photoId: string) {
    return this.http.get(`${this.base}/photos/${photoId}/exif`);
  }

  // ── Photos (admin) ──
  getAdminPhotos(page = 1, pageSize = 60): Observable<PhotoPage> {
    return this.http.get<PhotoPage>(
      `${this.base}/photos/admin?page=${page}&page_size=${pageSize}`,
    );
  }
  uploadPhotos(files: File[]): Observable<Photo[]> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return this.http.post<Photo[]>(`${this.base}/photos`, form);
  }
  updatePhoto(
    id: string,
    body: {
      title?: string | null;
      caption?: string | null;
      visible?: boolean;
      gallery_ids?: string[];
    },
  ): Observable<Photo> {
    return this.http.patch<Photo>(`${this.base}/photos/${id}`, body);
  }
  deletePhoto(id: string) {
    return this.http.delete(`${this.base}/photos/${id}`);
  }

  // ── Galleries ──
  getGalleries(): Observable<Gallery[]> {
    return this.http.get<Gallery[]>(`${this.base}/galleries`);
  }
  getGallery(slug: string): Observable<GalleryDetail> {
    return this.http.get<GalleryDetail>(`${this.base}/galleries/${slug}`);
  }
  createGallery(body: GalleryInput): Observable<Gallery> {
    return this.http.post<Gallery>(`${this.base}/galleries`, body);
  }
  updateGallery(id: string, body: Partial<GalleryInput>): Observable<Gallery> {
    return this.http.patch<Gallery>(`${this.base}/galleries/${id}`, body);
  }
  deleteGallery(id: string) {
    return this.http.delete(`${this.base}/galleries/${id}`);
  }
  reorderGalleries(ids: string[]) {
    return this.http.post(`${this.base}/galleries/reorder`, { ids });
  }
  reorderGalleryPhotos(galleryId: string, ids: string[]) {
    return this.http.post(`${this.base}/galleries/${galleryId}/photos/reorder`, {
      ids,
    });
  }
}
