import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';

import { Collage, CollageLayer, CollageLayerInput, Photo } from '../models';
import { ApiService } from '../services/api.service';

/** Canvas pixel dimensions per format — must match the backend renderer. */
const FORMAT_DIMS: Record<string, [number, number]> = {
  story: [1080, 1920],
  post: [1080, 1080],
};
const GRID_STEP = 0.05; // grid lines + snap increment (5% of canvas)
const MIN_SIZE = 0.04; // layers can't shrink below 4% of the canvas
const MIN_CROP = 0.05;

type DragMode = 'move' | 'resize' | 'rotate' | 'pan-crop';

interface DragState {
  mode: DragMode;
  layer: CollageLayer;
  handle: string; // tl|tr|bl|br for resize
  startX: number; // pointer px
  startY: number;
  rect: DOMRect; // canvas rect at drag start
  start: CollageLayer; // geometry snapshot
}

@Component({
  selector: 'app-collage-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="bar" *ngIf="collage() as c">
      <a routerLink="/admin/collages" class="btn-ghost">← Collages</a>
      <span class="badge">{{ c.format }} · 1080×{{ c.format === 'story' ? 1920 : 1080 }}</span>
      <span class="save muted small">{{ saveLabel() }}</span>

      <div class="bar-right">
        <label class="ctl" title="Canvas background">
          <input
            type="color"
            [ngModel]="c.background_color"
            (ngModelChange)="setBackground($event)"
          />
          BG
        </label>
        <button class="btn-ghost" [class.on]="grid()" (click)="grid.set(!grid())">
          # Grid
        </button>
        <button class="btn-ghost" (click)="drawer.set(!drawer())">+ Photos</button>
        <div class="export">
          <button class="btn-accent" [disabled]="exporting()" (click)="export('jpg')">
            {{ exporting() ? 'Exporting…' : 'Export JPG' }}
          </button>
          <button class="btn-ghost" [disabled]="exporting()" (click)="export('png')">
            PNG
          </button>
        </div>
      </div>
    </header>
    <p class="err" *ngIf="error()">{{ error() }}</p>

    <!-- Per-layer toolbar -->
    <div class="layer-bar" *ngIf="selectedLayer() as l">
      <button
        class="btn-ghost"
        [class.on]="cropMode()"
        (click)="cropMode.set(!cropMode())"
        title="Adjust which part of the photo shows"
      >
        ✂ Crop
      </button>
      <button
        class="btn-ghost"
        [class.on]="l.border_enabled"
        (click)="toggleBorder(l)"
      >
        ▣ Border
      </button>
      <span class="sep"></span>
      <button class="btn-ghost" (click)="reorder(l, 'front')" title="Bring to front">⏫</button>
      <button class="btn-ghost" (click)="reorder(l, 'up')" title="Bring forward">🔼</button>
      <button class="btn-ghost" (click)="reorder(l, 'down')" title="Send backward">🔽</button>
      <button class="btn-ghost" (click)="reorder(l, 'back')" title="Send to back">⏬</button>
      <span class="sep"></span>
      <button class="btn-ghost" (click)="resetCrop(l)" [disabled]="!isCropped(l)">
        Reset crop
      </button>
      <button class="btn-ghost danger" (click)="removeLayer(l)">✕ Delete</button>
      <span class="muted small hint" *ngIf="cropMode()">
        Crop mode: drag photo to pan · handles resize the frame
      </span>
    </div>

    <div class="stage" *ngIf="collage() as c">
      <div
        #canvas
        class="canvas"
        [class.story]="c.format === 'story'"
        [style.background]="c.background_color"
        (pointerdown)="onCanvasDown($event)"
      >
        <div class="grid-overlay" *ngIf="grid()"></div>

        <div
          class="layer"
          *ngFor="let l of layers(); trackBy: trackLayer"
          [class.selected]="selected() === l.id"
          [class.bordered]="l.border_enabled"
          [class.cropping]="cropMode() && selected() === l.id"
          [style.left.%]="l.pos_x * 100"
          [style.top.%]="l.pos_y * 100"
          [style.width.%]="l.width * 100"
          [style.height.%]="l.height * 100"
          [style.transform]="'rotate(' + l.rotation + 'deg)'"
          [style.zIndex]="l.z_index"
          (pointerdown)="onLayerDown($event, l)"
        >
          <div class="clip">
            <img
              [src]="api.imageUrl(l.thumb_url)"
              [style.width.%]="100 / l.crop_width"
              [style.height.%]="100 / l.crop_height"
              [style.left.%]="(-l.crop_x / l.crop_width) * 100"
              [style.top.%]="(-l.crop_y / l.crop_height) * 100"
              draggable="false"
              alt=""
            />
          </div>
          <ng-container *ngIf="selected() === l.id">
            <span class="rot-handle" (pointerdown)="onRotateDown($event, l)">↻</span>
            <span
              class="handle"
              *ngFor="let h of handles"
              [class]="'handle ' + h"
              (pointerdown)="onResizeDown($event, l, h)"
            ></span>
          </ng-container>
        </div>
      </div>
    </div>

    <!-- Photo picker drawer -->
    <aside class="drawer" [class.open]="drawer()">
      <div class="drawer-head">
        <strong>Add photos</strong>
        <button class="btn-ghost" (click)="drawer.set(false)">✕</button>
      </div>
      <label class="btn-ghost upload">
        ⤴ Upload one-off image
        <input type="file" accept="image/*" hidden (change)="uploadOneOff($event)" />
      </label>
      <p class="muted small">One-off images are deleted after export.</p>
      <div class="picker-grid">
        <button
          class="ph"
          *ngFor="let p of photos()"
          (click)="addFromLibrary(p)"
          [title]="p.filename"
        >
          <img [src]="api.imageUrl(p.thumbnail_url)" loading="lazy" alt="" />
        </button>
      </div>
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
        user-select: none;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        flex-wrap: wrap;
        margin-bottom: 0.8rem;
      }
      .bar-right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .badge {
        font-family: var(--font-display);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-accent);
      }
      .save {
        min-width: 4.5rem;
      }
      .small {
        font-size: 0.8rem;
      }
      .muted {
        color: var(--color-muted);
      }
      .err {
        color: #c33;
      }
      .ctl {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .ctl input[type='color'] {
        width: 26px;
        height: 26px;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        background: none;
        cursor: pointer;
      }
      .export {
        display: flex;
        gap: 0.35rem;
      }
      button.on {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }

      .layer-bar {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex-wrap: wrap;
        padding: 0.4rem 0.6rem;
        margin-bottom: 0.8rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      .layer-bar .sep {
        width: 1px;
        height: 1.2rem;
        background: var(--color-border);
        margin: 0 0.3rem;
      }
      .hint {
        margin-left: 0.5rem;
      }
      .danger {
        color: #c33;
      }

      .stage {
        display: grid;
        place-items: start center;
      }
      .canvas {
        position: relative;
        width: min(560px, 92vw);
        aspect-ratio: 1;
        overflow: hidden;
        border: 1px solid var(--color-border);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
        touch-action: none;
      }
      .canvas.story {
        width: min(380px, 88vw);
        aspect-ratio: 9 / 16;
      }
      .grid-overlay {
        position: absolute;
        inset: 0;
        z-index: 500;
        pointer-events: none;
        background-image:
          linear-gradient(to right, rgba(178, 58, 82, 0.25) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(178, 58, 82, 0.25) 1px, transparent 1px);
        background-size: 5% 5%;
      }

      .layer {
        position: absolute;
        cursor: grab;
        touch-action: none;
      }
      .layer:active {
        cursor: grabbing;
      }
      /* The frame clips the (crop-positioned) image; handles sit outside it. */
      .clip {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      .layer img {
        position: absolute;
        max-width: none;
        display: block;
        pointer-events: none;
      }
      .layer.bordered .clip {
        outline: 3px solid #b23a52;
      }
      .layer.selected {
        box-shadow: 0 0 0 2px var(--color-accent), 0 4px 18px rgba(0, 0, 0, 0.3);
      }
      .layer.cropping {
        box-shadow: 0 0 0 2px #3aa7b2, 0 4px 18px rgba(0, 0, 0, 0.3);
        cursor: move;
      }

      .handle {
        position: absolute;
        width: 14px;
        height: 14px;
        background: #fff;
        border: 2px solid var(--color-accent);
        border-radius: 50%;
        z-index: 600;
      }
      .cropping .handle {
        border-color: #3aa7b2;
        border-radius: 2px;
      }
      .handle.tl { top: -7px; left: -7px; cursor: nwse-resize; }
      .handle.tr { top: -7px; right: -7px; cursor: nesw-resize; }
      .handle.bl { bottom: -7px; left: -7px; cursor: nesw-resize; }
      .handle.br { bottom: -7px; right: -7px; cursor: nwse-resize; }
      .rot-handle {
        position: absolute;
        top: -34px;
        left: 50%;
        transform: translateX(-50%);
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        background: #fff;
        color: var(--color-accent);
        border: 2px solid var(--color-accent);
        border-radius: 50%;
        cursor: grab;
        z-index: 600;
        font-size: 0.8rem;
      }

      .drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(340px, 90vw);
        background: var(--color-surface);
        border-left: 1px solid var(--color-border);
        padding: 1rem;
        transform: translateX(100%);
        transition: transform 0.25s ease;
        z-index: 80;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .drawer.open {
        transform: translateX(0);
      }
      .drawer-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .upload {
        display: block;
        text-align: center;
        padding: 0.5rem;
        border: 1px dashed var(--color-border);
        border-radius: var(--radius);
        cursor: pointer;
      }
      .picker-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.35rem;
      }
      .ph {
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        overflow: hidden;
        cursor: pointer;
        background: none;
        aspect-ratio: 1;
      }
      .ph:hover {
        border-color: var(--color-accent);
      }
      .ph img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    `,
  ],
})
export class CollageEditorComponent implements OnInit, OnDestroy {
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLDivElement>;

  collage = signal<Collage | null>(null);
  layers = signal<CollageLayer[]>([]);
  photos = signal<Photo[]>([]);
  selected = signal<string | null>(null);
  cropMode = signal(false);
  grid = signal(false);
  drawer = signal(false);
  exporting = signal(false);
  error = signal('');
  saveState = signal<'saved' | 'saving' | 'unsaved'>('saved');

  handles = ['tl', 'tr', 'bl', 'br'];

  private drag: DragState | null = null;
  private dirty = new Map<string, CollageLayerInput>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private bgTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onUp = () => this.pointerUp();

  constructor(
    public api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getCollage(id).subscribe({
      next: (c) => {
        this.collage.set(c);
        this.layers.set([...c.layers]);
      },
      error: () => this.router.navigate(['/admin/collages']),
    });
    this.api.getAdminPhotos(1, 200).subscribe({
      next: (page) => this.photos.set(page.items),
    });
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  ngOnDestroy(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.flushNow().subscribe();
  }

  trackLayer(_i: number, l: CollageLayer): string {
    return l.id;
  }

  selectedLayer(): CollageLayer | null {
    return this.layers().find((l) => l.id === this.selected()) ?? null;
  }

  saveLabel(): string {
    return { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved' }[
      this.saveState()
    ];
  }

  isCropped(l: CollageLayer): boolean {
    return l.crop_x !== 0 || l.crop_y !== 0 || l.crop_width !== 1 || l.crop_height !== 1;
  }

  /** Canvas px aspect (w/h) for geometry math — from the format, not the DOM. */
  private canvasAspect(): number {
    const c = this.collage();
    const [w, h] = FORMAT_DIMS[c?.format ?? 'post'];
    return w / h;
  }

  // ── Selection ──
  onCanvasDown(e: PointerEvent): void {
    if (e.target === this.canvasRef?.nativeElement) {
      this.selected.set(null);
      this.cropMode.set(false);
    }
  }

  // ── Drag / pan-crop ──
  onLayerDown(e: PointerEvent, l: CollageLayer): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.selected() !== l.id) {
      this.selected.set(l.id);
      this.cropMode.set(false);
    }
    this.beginDrag(e, l, this.cropMode() ? 'pan-crop' : 'move', '');
  }

  onResizeDown(e: PointerEvent, l: CollageLayer, handle: string): void {
    e.preventDefault();
    e.stopPropagation();
    this.beginDrag(e, l, 'resize', handle);
  }

  onRotateDown(e: PointerEvent, l: CollageLayer): void {
    e.preventDefault();
    e.stopPropagation();
    this.beginDrag(e, l, 'rotate', '');
  }

  private beginDrag(e: PointerEvent, l: CollageLayer, mode: DragMode, handle: string): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.drag = {
      mode,
      layer: l,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      rect: canvas.getBoundingClientRect(),
      start: { ...l },
    };
  }

  private pointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const { rect, start } = d;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;

    if (d.mode === 'move') {
      let x = start.pos_x + dxPx / rect.width;
      let y = start.pos_y + dyPx / rect.height;
      if (this.grid()) {
        x = Math.round(x / GRID_STEP) * GRID_STEP;
        y = Math.round(y / GRID_STEP) * GRID_STEP;
      }
      this.patchLocal(d.layer, { pos_x: x, pos_y: y });
      return;
    }

    if (d.mode === 'rotate') {
      const cx = rect.left + (start.pos_x + start.width / 2) * rect.width;
      const cy = rect.top + (start.pos_y + start.height / 2) * rect.height;
      const a0 = Math.atan2(d.startY - cy, d.startX - cx);
      const a1 = Math.atan2(e.clientY - cy, e.clientX - cx);
      let deg = start.rotation + ((a1 - a0) * 180) / Math.PI;
      deg = Math.round(deg * 10) / 10;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      this.patchLocal(d.layer, { rotation: deg });
      return;
    }

    // Resize: work in canvas pixels, projecting the pointer delta onto the
    // layer's (possibly rotated) local axes.
    const theta = (start.rotation * Math.PI) / 180;
    const dlx = dxPx * Math.cos(theta) + dyPx * Math.sin(theta);
    const dly = -dxPx * Math.sin(theta) + dyPx * Math.cos(theta);
    const sx = d.handle.includes('l') ? -1 : 1;
    const sy = d.handle.includes('t') ? -1 : 1;
    const startWpx = start.width * rect.width;
    const startHpx = start.height * rect.height;
    const minPx = MIN_SIZE * rect.width;

    if (d.mode === 'resize' && !this.cropMode()) {
      // Normal resize: aspect-locked, crop untouched.
      let newWpx = Math.max(minPx, startWpx + sx * dlx);
      let newHpx = newWpx * (startHpx / startWpx);
      const upd: CollageLayerInput = {
        width: newWpx / rect.width,
        height: newHpx / rect.height,
      };
      if (sx < 0) upd.pos_x = start.pos_x + (startWpx - newWpx) / rect.width;
      if (sy < 0) upd.pos_y = start.pos_y + (startHpx - newHpx) / rect.height;
      this.patchLocal(d.layer, upd);
      return;
    }

    if (d.mode === 'resize') {
      // Crop-mode resize: the frame edge moves, the photo stays put — the
      // crop window grows/shrinks to reveal/hide part of the source.
      const imgWpx = startWpx / start.crop_width; // full source at display scale
      const imgHpx = startHpx / start.crop_height;
      const upd: CollageLayerInput = {};

      let wantWpx = Math.max(minPx, startWpx + sx * dlx);
      let cropW = wantWpx / imgWpx;
      const rightEdge = start.crop_x + start.crop_width;
      cropW = Math.max(MIN_CROP, Math.min(cropW, sx < 0 ? rightEdge : 1 - start.crop_x));
      const newWpx = cropW * imgWpx;
      upd.crop_width = cropW;
      if (sx < 0) {
        upd.crop_x = rightEdge - cropW;
        upd.pos_x = start.pos_x + (startWpx - newWpx) / rect.width;
      }
      upd.width = newWpx / rect.width;

      let wantHpx = Math.max(minPx, startHpx + sy * dly);
      let cropH = wantHpx / imgHpx;
      const bottomEdge = start.crop_y + start.crop_height;
      cropH = Math.max(MIN_CROP, Math.min(cropH, sy < 0 ? bottomEdge : 1 - start.crop_y));
      const newHpx = cropH * imgHpx;
      upd.crop_height = cropH;
      if (sy < 0) {
        upd.crop_y = bottomEdge - cropH;
        upd.pos_y = start.pos_y + (startHpx - newHpx) / rect.height;
      }
      upd.height = newHpx / rect.height;

      this.patchLocal(d.layer, upd);
      return;
    }

    if (d.mode === 'pan-crop') {
      // Drag the photo within its frame: pointer right = photo right = crop left.
      const imgWpx = startWpx / start.crop_width;
      const imgHpx = startHpx / start.crop_height;
      const cx = Math.min(
        Math.max(start.crop_x - dlx / imgWpx, 0),
        1 - start.crop_width,
      );
      const cy = Math.min(
        Math.max(start.crop_y - dly / imgHpx, 0),
        1 - start.crop_height,
      );
      this.patchLocal(d.layer, { crop_x: cx, crop_y: cy });
    }
  }

  private pointerUp(): void {
    this.drag = null;
  }

  // ── Keyboard ──
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const l = this.selectedLayer();
    if (!l || e.target instanceof HTMLInputElement) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.removeLayer(l);
      return;
    }
    const step = e.shiftKey ? 0.05 : 0.01;
    const nudge: Record<string, CollageLayerInput> = {
      ArrowLeft: { pos_x: l.pos_x - step },
      ArrowRight: { pos_x: l.pos_x + step },
      ArrowUp: { pos_y: l.pos_y - step },
      ArrowDown: { pos_y: l.pos_y + step },
    };
    if (nudge[e.key]) {
      e.preventDefault();
      this.patchLocal(l, nudge[e.key]);
    }
  }

  // ── Layer operations ──
  addFromLibrary(p: Photo): void {
    const c = this.collage();
    if (!c) return;
    const aspect = (p.width || 3) / (p.height || 2);
    const geo = this.defaultPlacement(aspect);
    this.api
      .addCollageLayer(c.id, { ...geo, photo_id: p.id })
      .subscribe({
        next: (layer) => {
          this.layers.set([...this.layers(), layer]);
          this.selected.set(layer.id);
        },
        error: () => this.error.set('Could not add photo.'),
      });
  }

  uploadOneOff(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    const c = this.collage();
    input.value = '';
    if (!file || !c) return;
    this.api.uploadOneOff(c.id, file).subscribe({
      next: (up) => {
        const aspect = (up.width || 3) / (up.height || 2);
        const geo = this.defaultPlacement(aspect);
        this.api
          .addCollageLayer(c.id, { ...geo, one_off_path: up.one_off_path })
          .subscribe({
            next: (layer) => {
              this.layers.set([...this.layers(), layer]);
              this.selected.set(layer.id);
            },
            error: () => this.error.set('Could not place uploaded image.'),
          });
      },
      error: () => this.error.set('Upload failed.'),
    });
  }

  /** Center-ish placement with a small scatter so stacked adds stay visible. */
  private defaultPlacement(aspect: number): CollageLayerInput {
    const ar = this.canvasAspect();
    let w = 0.42;
    let h = (w * ar) / aspect;
    if (h > 0.6) {
      h = 0.6;
      w = (h * aspect) / ar;
    }
    const jitter = () => (Math.random() - 0.5) * 0.12;
    const maxZ = Math.max(0, ...this.layers().map((l) => l.z_index));
    return {
      pos_x: (1 - w) / 2 + jitter(),
      pos_y: (1 - h) / 2 + jitter(),
      width: w,
      height: h,
      rotation: 0,
      z_index: maxZ + 1,
    };
  }

  removeLayer(l: CollageLayer): void {
    const c = this.collage();
    if (!c) return;
    this.dirty.delete(l.id);
    this.layers.set(this.layers().filter((x) => x.id !== l.id));
    if (this.selected() === l.id) this.selected.set(null);
    this.api.deleteCollageLayer(c.id, l.id).subscribe({
      error: () => this.error.set('Could not delete layer.'),
    });
  }

  toggleBorder(l: CollageLayer): void {
    this.patchLocal(l, { border_enabled: !l.border_enabled });
  }

  resetCrop(l: CollageLayer): void {
    // Restore the full image, keeping the frame width and re-deriving height
    // from the uncropped aspect so the photo isn't distorted.
    const ar = this.canvasAspect();
    const shownAspect = (l.width / l.height) * ar; // current on-canvas aspect
    const fullAspect = shownAspect * (l.crop_height / l.crop_width);
    const h = (l.width * ar) / fullAspect;
    this.patchLocal(l, {
      crop_x: 0,
      crop_y: 0,
      crop_width: 1,
      crop_height: 1,
      height: h,
    });
  }

  reorder(l: CollageLayer, dir: 'up' | 'down' | 'front' | 'back'): void {
    const sorted = [...this.layers()].sort((a, b) => a.z_index - b.z_index);
    const idx = sorted.findIndex((x) => x.id === l.id);
    if (dir === 'front' && idx < sorted.length - 1) {
      this.patchLocal(l, { z_index: sorted[sorted.length - 1].z_index + 1 });
    } else if (dir === 'back' && idx > 0) {
      this.patchLocal(l, { z_index: sorted[0].z_index - 1 });
    } else if (dir === 'up' && idx < sorted.length - 1) {
      const other = sorted[idx + 1];
      this.patchLocal(l, { z_index: other.z_index });
      this.patchLocal(other, { z_index: l.z_index });
    } else if (dir === 'down' && idx > 0) {
      const other = sorted[idx - 1];
      this.patchLocal(l, { z_index: other.z_index });
      this.patchLocal(other, { z_index: l.z_index });
    }
  }

  // ── Background ──
  setBackground(color: string): void {
    const c = this.collage();
    if (!c) return;
    this.collage.set({ ...c, background_color: color });
    this.saveState.set('unsaved');
    if (this.bgTimer) clearTimeout(this.bgTimer);
    this.bgTimer = setTimeout(() => {
      this.saveState.set('saving');
      this.api.updateCollage(c.id, { background_color: color }).subscribe({
        next: () => this.markSavedIfClean(),
        error: () => this.error.set('Could not save background.'),
      });
    }, 500);
  }

  // ── Autosave ──
  /** Apply a geometry change locally and queue it for debounced persistence. */
  private patchLocal(l: CollageLayer, changes: CollageLayerInput): void {
    this.layers.set(
      this.layers().map((x) => (x.id === l.id ? { ...x, ...changes } : x)),
    );
    // Merge into this layer's pending patch. Note `l` may be a stale
    // reference — always read back the merged object we just wrote.
    this.dirty.set(l.id, { ...(this.dirty.get(l.id) ?? {}), ...changes });
    this.saveState.set('unsaved');
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 600);
  }

  private flush(): void {
    this.flushNow().subscribe({
      next: () => this.markSavedIfClean(),
      error: () => this.error.set('Autosave failed — changes may be lost.'),
    });
  }

  private flushNow(): Observable<unknown> {
    const c = this.collage();
    if (!c || this.dirty.size === 0) return of(null);
    const patches = [...this.dirty.entries()].map(([layerId, body]) =>
      this.api.updateCollageLayer(c.id, layerId, body),
    );
    this.dirty.clear();
    this.saveState.set('saving');
    return forkJoin(patches);
  }

  private markSavedIfClean(): void {
    if (this.dirty.size === 0) this.saveState.set('saved');
  }

  // ── Export ──
  export(format: 'jpg' | 'png'): void {
    const c = this.collage();
    if (!c) return;
    this.exporting.set(true);
    // Push any pending edits first so the render matches what's on screen.
    this.flushNow().subscribe({
      next: () => {
        this.api.exportCollage(c.id, format).subscribe({
          next: (blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `collage-${c.format}-${c.id.slice(0, 8)}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
            this.exporting.set(false);
            this.markSavedIfClean();
            // One-off layers are purged server-side on export — re-sync.
            this.api.getCollage(c.id).subscribe({
              next: (fresh) => {
                this.collage.set(fresh);
                this.layers.set([...fresh.layers]);
              },
            });
          },
          error: () => {
            this.error.set('Export failed.');
            this.exporting.set(false);
          },
        });
      },
      error: () => {
        this.error.set('Could not save before export.');
        this.exporting.set(false);
      },
    });
  }
}
