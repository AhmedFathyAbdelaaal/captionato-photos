/** Mirrors the backend Pydantic schemas (app/schemas.py). */

// ── Users ──
/** pending: landing hero only · client: granted galleries only ·
 *  verified: portfolio + granted galleries · admin: everything. */
export type UserRole = 'pending' | 'client' | 'verified' | 'admin';

export interface Me {
  id: string;
  username: string;
  role: UserRole;
  /** "Elevated": may download originals anywhere they can see. */
  can_download: boolean;
}

export interface AdminUser extends Me {
  note?: string | null;
  created_at: string;
  last_login_at?: string | null;
  gallery_ids: string[];
}

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
  taken_at?: string | null; // EXIF capture date; null when unknown
  thumbnail_url: string;
  display_url: string; // ~2560px lightbox derivative
  /** Only present when the viewer may download originals here. */
  original_url?: string | null;
  /** Social counts — only filled where the viewer can take part. comment_count
   *  is for the current context (this gallery / the portfolio). */
  comment_count?: number;
  capy_count?: number;
  capied?: boolean;
  tags?: string[]; // freeform lowercase tags; 'featured' drives the homepage
  gallery_ids?: string[] | null; // admin listing only
}

/** The reserved tag that decides which photos appear on the homepage hero. */
export const FEATURED_TAG = 'featured';

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

/** assigned: only users granted it can see it · password: also any approved
 *  user who knows the password. */
export type GalleryVisibility = 'assigned' | 'password';

export interface Gallery {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cover_photo_id?: string | null;
  layout: GalleryLayout;
  force_theme: ForceTheme;
  accent_color?: string | null;
  visibility: GalleryVisibility;
  display_order: number;
  created_at: string;
  photo_count: number;
  cover_thumbnail_url?: string | null;
  /** True when a password_hash is set on the backend (never the hash itself). */
  has_password: boolean;
}

export interface GalleryDetail extends Gallery {
  photos: Photo[];
  /** True when the visitor hasn't unlocked a password-gated gallery yet. */
  locked: boolean;
  /** Signed zip of every original — only when the viewer may download here. */
  download_all_url?: string | null;
  /** True when the viewer may comment / give capys here (admin or granted). */
  social?: boolean;
  /** Comments on the gallery as a whole. */
  comment_count?: number;
}

// ── Collage maker ──
// Geometry is normalized: pos/size are fractions of canvas width/height,
// crop bounds fractions of the source image. Rotation degrees, clockwise.
export type CollageFormat = 'story' | 'post';
/** Instagram post-slide sizes. */
export type SlideFormat = 'square' | 'portrait' | 'landscape';
/** Any canvas the collage editor can render. */
export type CanvasFormat = CollageFormat | SlideFormat;

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
  locked: boolean;
  z_index: number;
}

export type CollageLayerInput = Partial<
  Omit<CollageLayer, 'id' | 'thumb_url'>
>;

export interface Collage {
  id: string;
  format: CanvasFormat;
  background_color: string;
  status: 'draft' | 'exported';
  created_at: string;
  updated_at: string;
  exported_at?: string | null;
  layer_count: number;
  layers: CollageLayer[];
  post_id?: string | null; // set when this collage is a slide of a post
  slide_order?: number;
}

export interface OneOffUpload {
  one_off_path: string;
  thumb_url: string;
  width?: number | null;
  height?: number | null;
}

// ── Posts (multi-slide; each slide is a Collage) ──
export interface Post {
  id: string;
  name: string;
  status: 'draft' | 'exported';
  created_at: string;
  updated_at: string;
  exported_at?: string | null;
  slide_count: number;
  cover_thumb_url?: string | null;
}

export interface PostDetail extends Post {
  slides: Collage[];
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
  visibility?: GalleryVisibility;
  /** Plaintext — hashed server-side. Empty string clears an existing password. */
  password?: string | null;
}

// ── Comments + capys ──
/** Where a comment lives: a gallery (photo_id null), a photo inside a gallery,
 *  or a photo in the portfolio (gallery_id null). */
export interface CommentContext {
  gallery_id: string | null;
  photo_id: string | null;
}

export interface CommentAuthor {
  id: string;
  username: string;
  is_admin: boolean;
}

export interface CommentItem {
  id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  author: CommentAuthor;
  mine: boolean;
  can_delete: boolean;
  replies: CommentItem[];
}

export interface CommentFeedItem {
  id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  author: CommentAuthor;
  parent_id?: string | null;
  gallery?: { id: string; slug: string; name: string } | null;
  photo?: { id: string; thumbnail_url: string; filename: string } | null;
  unread: boolean;
}

export interface CommentFeed {
  items: CommentFeedItem[];
  unread: number;
}

export interface CapyState {
  capy_count: number;
  capied: boolean;
}
