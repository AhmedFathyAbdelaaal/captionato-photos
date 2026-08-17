import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG, AppConfig } from '../config';
import {
  Collage,
  CollageFormat,
  CollageLayer,
  CollageLayerInput,
  Gallery,
  GalleryDetail,
  GalleryInput,
  OneOffUpload,
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
  getPhotos(
    page = 1,
    pageSize = 60,
    sort: 'taken' | 'uploaded' = 'taken',
  ): Observable<PhotoPage> {
    return this.http.get<PhotoPage>(
      `${this.base}/photos?page=${page}&page_size=${pageSize}&sort=${sort}`,
    );
  }
  getExif(photoId: string) {
    return this.http.get(`${this.base}/photos/${photoId}/exif`);
  }

  // ── Photos (admin) ──
  getAdminPhotos(
    page = 1,
    pageSize = 60,
    sort: 'taken' | 'uploaded' = 'taken',
  ): Observable<PhotoPage> {
    return this.http.get<PhotoPage>(
      `${this.base}/photos/admin?page=${page}&page_size=${pageSize}&sort=${sort}`,
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

  // ── Bulk photo actions ──
  bulkSetVisibility(photo_ids: string[], visible: boolean) {
    return this.http.post(`${this.base}/photos/bulk/visibility`, {
      photo_ids,
      visible,
    });
  }
  bulkDelete(photo_ids: string[]) {
    return this.http.post(`${this.base}/photos/bulk/delete`, { photo_ids });
  }
  bulkAddToGalleries(photo_ids: string[], gallery_ids: string[]) {
    return this.http.post(`${this.base}/photos/bulk/galleries`, {
      photo_ids,
      gallery_ids,
    });
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

  // ── Collage maker (admin) ──
  getCollages(): Observable<Collage[]> {
    return this.http.get<Collage[]>(`${this.base}/collages`);
  }
  getCollage(id: string): Observable<Collage> {
    return this.http.get<Collage>(`${this.base}/collages/${id}`);
  }
  createCollage(format: CollageFormat, background_color = '#000000'): Observable<Collage> {
    return this.http.post<Collage>(`${this.base}/collages`, {
      format,
      background_color,
    });
  }
  updateCollage(
    id: string,
    body: { background_color?: string; status?: 'draft' | 'exported' },
  ): Observable<Collage> {
    return this.http.patch<Collage>(`${this.base}/collages/${id}`, body);
  }
  deleteCollage(id: string) {
    return this.http.delete(`${this.base}/collages/${id}`);
  }
  addCollageLayer(
    collageId: string,
    body: CollageLayerInput,
  ): Observable<CollageLayer> {
    return this.http.post<CollageLayer>(
      `${this.base}/collages/${collageId}/layers`,
      body,
    );
  }
  updateCollageLayer(
    collageId: string,
    layerId: string,
    body: CollageLayerInput,
  ): Observable<CollageLayer> {
    return this.http.patch<CollageLayer>(
      `${this.base}/collages/${collageId}/layers/${layerId}`,
      body,
    );
  }
  deleteCollageLayer(collageId: string, layerId: string) {
    return this.http.delete(
      `${this.base}/collages/${collageId}/layers/${layerId}`,
    );
  }
  uploadOneOff(collageId: string, file: File): Observable<OneOffUpload> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<OneOffUpload>(
      `${this.base}/collages/${collageId}/upload-one-off`,
      form,
    );
  }
  generateAutoCollages(
    format: CollageFormat,
    photo_ids: string[],
  ): Observable<Collage[]> {
    return this.http.post<Collage[]>(`${this.base}/collages/generate-auto`, {
      format,
      photo_ids,
    });
  }
  exportCollage(id: string, format: 'jpg' | 'png' = 'jpg'): Observable<Blob> {
    return this.http.post(
      `${this.base}/collages/${id}/export?format=${format}`,
      null,
      { responseType: 'blob' },
    );
  }
}
