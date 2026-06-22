/** Mirrors the backend Pydantic schemas (app/schemas.py). */

export interface Exif {
  camera?: string;
  lens?: string;
  focal_length?: string;
  aperture?: string;
  shutter_speed?: string;
  iso?: string;
  date_taken?: string;
}

export interface Photo {
  id: string;
  filename: string;
  title?: string | null;
  caption?: string | null;
  visible: boolean;
  width?: number | null;
  height?: number | null;
  exif?: Exif | null;
  uploaded_at: string;
  thumbnail_url: string;
  original_url: string;
  gallery_ids?: string[] | null; // admin listing only
}

export interface PhotoPage {
  items: Photo[];
  total: number;
  page: number;
  page_size: number;
}

export type GalleryLayout =
  | 'masonry'
  | 'grid'
  | 'editorial'
  | 'slideshow'
  | 'moodboard';

export type ForceTheme = 'system' | 'light' | 'dark';

export interface Gallery {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cover_photo_id?: string | null;
  layout: GalleryLayout;
  force_theme: ForceTheme;
  accent_color?: string | null;
  display_order: number;
  created_at: string;
  photo_count: number;
  cover_thumbnail_url?: string | null;
}

export interface GalleryDetail extends Gallery {
  photos: Photo[];
}

export interface GalleryInput {
  name: string;
  slug: string;
  description?: string | null;
  cover_photo_id?: string | null;
  layout?: GalleryLayout;
  force_theme?: ForceTheme;
  accent_color?: string | null;
  display_order?: number;
}
