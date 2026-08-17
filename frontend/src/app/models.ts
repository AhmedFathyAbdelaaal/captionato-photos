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
  display_url: string; // ~2560px lightbox derivative
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
  | 'moodboard'
  | 'collage'
  | 'polaroid'
  | 'filmstrip'
  | 'marquee';

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

// ── Collage maker ──
// Geometry is normalized: pos/size are fractions of canvas width/height,
// crop bounds fractions of the source image. Rotation degrees, clockwise.
export type CollageFormat = 'story' | 'post';

export interface CollageLayer {
  id: string;
  photo_id?: string | null;
  one_off_path?: string | null;
  thumb_url: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
  border_enabled: boolean;
  z_index: number;
}

export type CollageLayerInput = Partial<
  Omit<CollageLayer, 'id' | 'thumb_url'>
>;

export interface Collage {
  id: string;
  format: CollageFormat;
  background_color: string;
  status: 'draft' | 'exported';
  created_at: string;
  updated_at: string;
  exported_at?: string | null;
  layer_count: number;
  layers: CollageLayer[];
}

export interface OneOffUpload {
  one_off_path: string;
  thumb_url: string;
  width?: number | null;
  height?: number | null;
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
