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
import { Observable, forkJoin, of, tap } from 'rxjs';

import { Collage, CollageLayer, CollageLayerInput, Photo } from '../models';
import { ApiService } from '../services/api.service';

/** Canvas pixel dimensions per format — must match the backend renderer. */
const FORMAT_DIMS: Record<string, [number, number]> = {
  story: [1080, 1920],
  post: [1080, 1080],
};
const MIN_SIZE = 0.04; // layers can't shrink below 4% of the canvas
const MIN_CROP = 0.05;
const MIN_COLS = 2;
const MAX_COLS = 24;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 6;
const SNAP_PX = 7; // smart-guide / grid snap threshold, in screen pixels

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

/** A candidate line (canvas fraction) a dragged edge/center can snap to.
 *  `guide` marks the sibling/canvas ones we draw a flashing line for; grid
 *  lines are already visible so they don't. */
interface SnapTarget {
  pos: number;
  guide: boolean;
}

interface GuideLine {
  axis: 'x' | 'y';
  pos: number;
}

/** An undoable state of the collage. Layers are cloned so history entries are
 *  immutable snapshots, not live references. */
interface Snapshot {
  background: string;
  layers: CollageLayer[];
}

@Component({
  selector: 'app-collage-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="bar" *ngIf="collage() as c">
      <a routerLink="/admin/collages" class="btn-ghost">← Collages</a>
      <span class="badge">{{ c.format }} · 1080×{{ c.format === 'story' ? 1920 : 1080 }}</span>
      <div class="stepper" title="Undo / redo">
        <button class="btn-ghost" (click)="undo()" [disabled]="!canUndo()" title="Undo (Ctrl+Z)">↶</button>
        <button class="btn-ghost" (click)="redo()" [disabled]="!canRedo()" title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>
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
        <div class="stepper" *ngIf="grid()" title="Grid density (columns)">
          <button class="btn-ghost" (click)="setCols(-1)" [disabled]="gridCols() <= minCols">−</button>
          <span class="small muted mono">{{ gridCols() }}×{{ gridRows() }}</span>
          <button class="btn-ghost" (click)="setCols(1)" [disabled]="gridCols() >= maxCols">+</button>
        </div>
        <button
          class="btn-ghost"
          [class.on]="snap()"
          (click)="snap.set(!snap())"
          title="Snap moves &amp; resizes to the grid"
        >
          🧲 Snap
        </button>
        <button
          class="btn-ghost"
          [class.on]="guides()"
          (click)="guides.set(!guides())"
          title="Snap to other photos' edges/centers and the canvas center"
        >
          ⌖ Guides
        </button>
        <div class="stepper" title="Zoom (Ctrl/⌘ + scroll)">
          <button class="btn-ghost" (click)="zoomBy(-1)" [disabled]="zoom() <= zoomMin">−</button>
          <button class="btn-ghost mono" (click)="resetZoom()">{{ zoom() * 100 | number: '1.0-0' }}%</button>
          <button class="btn-ghost" (click)="zoomBy(1)" [disabled]="zoom() >= zoomMax">+</button>
        </div>
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
      <button class="btn-ghost" (click)="duplicate(l)" title="Duplicate (Ctrl+D)">⧉ Duplicate</button>
      <button class="btn-ghost danger" (click)="removeLayer(l)">✕ Delete</button>
      <span class="sep"></span>
      <button
        class="btn-ghost"
        [class.on]="inspectorOpen()"
        (click)="inspectorOpen.set(!inspectorOpen())"
        title="Numeric values"
      >
        ≡ Values
      </button>
      <span class="muted small hint" *ngIf="cropMode()">
        Crop mode: drag photo to pan · handles resize the frame
      </span>
    </div>

    <!-- Numeric inspector -->
    <div class="inspector" *ngIf="inspectorOpen() && selectedLayer() as l">
      <label>X<input type="number" [value]="pxX(l)" (change)="setPxX(l, $any($event.target).value)" /></label>
      <label>Y<input type="number" [value]="pxY(l)" (change)="setPxY(l, $any($event.target).value)" /></label>
      <label>W<input type="number" [value]="pxW(l)" (change)="setPxW(l, $any($event.target).value)" /></label>
      <label>H<input type="number" [value]="pxH(l)" (change)="setPxH(l, $any($event.target).value)" /></label>
      <label>Rot<input type="number" step="1" [value]="degVal(l)" (change)="setDeg(l, $any($event.target).value)" /><span class="unit">°</span></label>
      <label class="chk">
        <input type="checkbox" [checked]="lockAspect()" (change)="lockAspect.set($any($event.target).checked)" />
        lock aspect
      </label>
      <button class="btn-ghost" (click)="centerH(l)" title="Center horizontally">↔ Center</button>
      <button class="btn-ghost" (click)="centerV(l)" title="Center vertically">↕ Center</button>
      <span class="muted small mono">px @1080</span>
    </div>

    <div class="stage" *ngIf="collage() as c">
      <div class="viewport" #viewport (wheel)="onWheel($event)">
      <div
        #canvas
        class="canvas"
        [class.story]="c.format === 'story'"
        [style.background]="c.background_color"
        [style.--zoom]="zoom()"
        (pointerdown)="onCanvasDown($event)"
      >
        <div
          class="grid-overlay"
          *ngIf="grid()"
          [style.--cols]="gridCols()"
          [style.--rows]="gridRows()"
        >
          <div class="g-minor"></div>
          <div class="g-thirds"></div>
        </div>

        <!-- Smart alignment guides (flash during a drag) -->
        <div class="guides" *ngIf="guideLines().length">
          <div
            *ngFor="let g of guideLines()"
            class="guide-line"
            [class.vert]="g.axis === 'x'"
            [class.horz]="g.axis === 'y'"
            [style.left.%]="g.axis === 'x' ? g.pos * 100 : null"
            [style.top.%]="g.axis === 'y' ? g.pos * 100 : null"
          ></div>
        </div>

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
      .stepper {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.1rem;
      }
      .stepper button {
        border: 0;
        padding: 0.2rem 0.5rem;
      }
      .stepper .mono {
        min-width: 3.2rem;
        text-align: center;
      }
      .mono {
        font-variant-numeric: tabular-nums;
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

      .inspector {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        padding: 0.4rem 0.6rem;
        margin-bottom: 0.8rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        font-size: 0.85rem;
      }
      .inspector label {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        color: var(--color-muted);
      }
      .inspector input[type='number'] {
        width: 4.2rem;
        padding: 0.25rem 0.4rem;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        background: var(--color-paper);
        color: var(--color-ink);
        font-variant-numeric: tabular-nums;
      }
      .inspector .chk {
        gap: 0.35rem;
      }
      .inspector .unit {
        margin-left: -0.15rem;
        color: var(--color-muted);
      }

      .stage {
        display: block;
      }
      /* Scrollable frame around the canvas so zoomed-in work can pan. */
      .viewport {
        overflow: auto;
        max-height: calc(100vh - 15rem);
        padding: 1rem;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background: var(--color-paper);
        border-radius: var(--radius);
      }
      .canvas {
        position: relative;
        flex: 0 0 auto;
        width: calc(min(560px, 92vw) * var(--zoom, 1));
        aspect-ratio: 1;
        overflow: hidden;
        border: 1px solid var(--color-border);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
        touch-action: none;
      }
      .canvas.story {
        width: calc(min(380px, 88vw) * var(--zoom, 1));
        aspect-ratio: 9 / 16;
      }
      .grid-overlay {
        position: absolute;
        inset: 0;
        z-index: 500;
        pointer-events: none;
      }
      /* Fine cell grid — cols/rows come from the toolbar. */
      .g-minor {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, rgba(178, 58, 82, 0.22) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(178, 58, 82, 0.22) 1px, transparent 1px);
        background-size: calc(100% / var(--cols)) calc(100% / var(--rows));
      }
      /* Rule-of-thirds guides, layered stronger over the fine grid. */
      .g-thirds {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, rgba(255, 255, 255, 0.55) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.55) 1px, transparent 1px);
        background-position: 33.333% 0, 0 33.333%;
        background-size: 33.334% 100%, 100% 33.334%;
        background-repeat: repeat-x, repeat-y;
        mix-blend-mode: difference;
        opacity: 0.7;
      }

      .guides {
        position: absolute;
        inset: 0;
        z-index: 680;
        pointer-events: none;
      }
      .guide-line {
        position: absolute;
        background: #d6362b;
        box-shadow: 0 0 3px rgba(214, 54, 43, 0.9);
      }
      .guide-line.vert {
        top: 0;
        bottom: 0;
        width: 1px;
        transform: translateX(-0.5px);
      }
      .guide-line.horz {
        left: 0;
        right: 0;
        height: 1px;
        transform: translateY(-0.5px);
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
        outline: 3px solid #d6362b;
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
  grid = signal(true);
  snap = signal(true);
  guides = signal(true);
  guideLines = signal<GuideLine[]>([]);
  gridCols = signal(6);
  zoom = signal(1);
  inspectorOpen = signal(true);
  lockAspect = signal(false);
  drawer = signal(false);
  exporting = signal(false);
  error = signal('');
  saveState = signal<'saved' | 'saving' | 'unsaved'>('saved');

  handles = ['tl', 'tr', 'bl', 'br'];
  readonly minCols = MIN_COLS;
  readonly maxCols = MAX_COLS;
  readonly zoomMin = ZOOM_MIN;
  readonly zoomMax = ZOOM_MAX;

  private drag: DragState | null = null;
  private dragMoved = false;
  private dirty = new Map<string, CollageLayerInput>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private bgTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Undo/redo history ──
  private history: Snapshot[] = [];
  private histIndex = -1; // points at the current live state
  private lastKind = '';
  private lastCommitAt = 0;
  // Kinds whose rapid repeats collapse into a single history entry.
  private readonly COALESCE = new Set(['nudge', 'bg']);
  canUndo = signal(false);
  canRedo = signal(false);
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
        this.resetHistory();
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

  /** Rows are derived from columns so cells stay near-square and tile the
   *  whole canvas (grid reaches all four edges). */
  gridRows(): number {
    const [w, h] = FORMAT_DIMS[this.collage()?.format ?? 'post'];
    return Math.max(1, Math.round(this.gridCols() * (h / w)));
  }

  private stepX(): number {
    return 1 / this.gridCols();
  }
  private stepY(): number {
    return 1 / this.gridRows();
  }
  private snapTo(value: number, step: number): number {
    return Math.round(value / step) * step;
  }

  /** Candidate snap lines for one axis: grid lines (when grid-snap is on) and
   *  sibling/canvas edges + centers (when smart guides are on). Grid lines are
   *  flagged non-guide so they don't draw a redundant pink line. */
  private buildTargets(axis: 'x' | 'y', start: CollageLayer): SnapTarget[] {
    const isX = axis === 'x';
    const out: SnapTarget[] = [];
    if (this.snap()) {
      const step = isX ? this.stepX() : this.stepY();
      const n = Math.round(1 / step);
      for (let k = 0; k <= n; k++) out.push({ pos: k * step, guide: false });
    }
    // Smart guides are only meaningful for an un-rotated moving layer, and
    // only align to un-rotated siblings (their edges are axis-aligned).
    if (this.guides() && start.rotation === 0) {
      out.push({ pos: 0, guide: true }, { pos: 0.5, guide: true }, { pos: 1, guide: true });
      for (const l2 of this.layers()) {
        if (l2.id === start.id || l2.rotation !== 0) continue;
        const a = isX ? l2.pos_x : l2.pos_y;
        const s = isX ? l2.width : l2.height;
        out.push({ pos: a, guide: true }, { pos: a + s / 2, guide: true }, { pos: a + s, guide: true });
      }
    }
    return out;
  }

  /** Nearest target to any of the moving lines within threshold. Returns the
   *  shift to apply and, if a drawable guide won, the line to render. */
  private snapAxis(
    movingLines: number[],
    targets: SnapTarget[],
    thresh: number,
  ): { delta: number; guidePos: number | null } | null {
    let best: { delta: number; guidePos: number | null } | null = null;
    for (const m of movingLines) {
      for (const t of targets) {
        const d = t.pos - m;
        if (Math.abs(d) <= thresh && (!best || Math.abs(d) < Math.abs(best.delta))) {
          best = { delta: d, guidePos: t.guide ? t.pos : null };
        }
      }
    }
    return best;
  }

  /** The layer's *source* photo aspect (w/h in px), backed out from its
   *  current on-canvas size and crop — works for library and one-off layers
   *  without needing the source dimensions. */
  private sourceAspect(l: CollageLayer): number {
    const shown = (l.width / l.height) * this.canvasAspect();
    return shown * (l.crop_height / l.crop_width);
  }

  /** Centered cover-crop that fills a cell of the given aspect with a source
   *  of the given aspect (both w/h in px) — same math as the backend renderer
   *  and the auto-layout generator. */
  private coverCrop(cellAspect: number, srcAspect: number): CollageLayerInput {
    if (srcAspect >= cellAspect) {
      const cw = cellAspect / srcAspect;
      return { crop_x: (1 - cw) / 2, crop_y: 0, crop_width: cw, crop_height: 1 };
    }
    const ch = srcAspect / cellAspect;
    return { crop_x: 0, crop_y: (1 - ch) / 2, crop_width: 1, crop_height: ch };
  }

  // ── Numeric inspector (values shown as px at the 1080-wide export res) ──
  private canvasDims(): [number, number] {
    return FORMAT_DIMS[this.collage()?.format ?? 'post'];
  }
  pxX(l: CollageLayer): number {
    return Math.round(l.pos_x * this.canvasDims()[0]);
  }
  pxY(l: CollageLayer): number {
    return Math.round(l.pos_y * this.canvasDims()[1]);
  }
  pxW(l: CollageLayer): number {
    return Math.round(l.width * this.canvasDims()[0]);
  }
  pxH(l: CollageLayer): number {
    return Math.round(l.height * this.canvasDims()[1]);
  }
  degVal(l: CollageLayer): number {
    return Math.round(l.rotation * 10) / 10;
  }

  private num(v: string): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  setPxX(l: CollageLayer, v: string): void {
    const n = this.num(v);
    if (n === null) return;
    this.patchLocal(l, { pos_x: n / this.canvasDims()[0] });
    this.commit('inspector');
  }
  setPxY(l: CollageLayer, v: string): void {
    const n = this.num(v);
    if (n === null) return;
    this.patchLocal(l, { pos_y: n / this.canvasDims()[1] });
    this.commit('inspector');
  }
  setPxW(l: CollageLayer, v: string): void {
    const n = this.num(v);
    if (n === null) return;
    const nw = Math.max(MIN_SIZE, n / this.canvasDims()[0]);
    const nh = this.lockAspect() ? (nw * l.height) / l.width : l.height;
    this.applyResize(l, nw, nh);
    this.commit('inspector');
  }
  setPxH(l: CollageLayer, v: string): void {
    const n = this.num(v);
    if (n === null) return;
    const nh = Math.max(MIN_SIZE, n / this.canvasDims()[1]);
    const nw = this.lockAspect() ? (nh * l.width) / l.height : l.width;
    this.applyResize(l, nw, nh);
    this.commit('inspector');
  }
  setDeg(l: CollageLayer, v: string): void {
    const n = this.num(v);
    if (n === null) return;
    this.patchLocal(l, { rotation: n });
    this.commit('inspector');
  }

  /** Apply a new frame size, re-filling the photo with a cover-crop so a
   *  changed aspect never distorts (matches grid-snap resize). */
  private applyResize(l: CollageLayer, nw: number, nh: number): void {
    const cellAspect = (nw / nh) * this.canvasAspect();
    this.patchLocal(l, {
      width: nw,
      height: nh,
      ...this.coverCrop(cellAspect, this.sourceAspect(l)),
    });
  }

  centerH(l: CollageLayer): void {
    this.patchLocal(l, { pos_x: (1 - l.width) / 2 });
    this.commit('align');
  }
  centerV(l: CollageLayer): void {
    this.patchLocal(l, { pos_y: (1 - l.height) / 2 });
    this.commit('align');
  }

  // ── Grid & zoom controls ──
  setCols(delta: number): void {
    this.gridCols.set(
      Math.min(MAX_COLS, Math.max(MIN_COLS, this.gridCols() + delta)),
    );
  }
  zoomBy(dir: number): void {
    this.setZoom(this.zoom() * (dir > 0 ? 1.25 : 0.8));
  }
  setZoom(z: number): void {
    this.zoom.set(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)));
  }
  resetZoom(): void {
    this.zoom.set(1);
  }
  onWheel(e: WheelEvent): void {
    // Ctrl/⌘ + scroll zooms; plain scroll pans the viewport normally.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.setZoom(this.zoom() * (e.deltaY < 0 ? 1.1 : 0.9));
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
    this.dragMoved = false;
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
    this.dragMoved = true;
    const { rect, start } = d;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;

    if (d.mode === 'move') {
      let x = start.pos_x + dxPx / rect.width;
      let y = start.pos_y + dyPx / rect.height;
      const active: GuideLine[] = [];
      // Alt temporarily bypasses all snapping for fine positioning.
      if (!e.altKey && (this.snap() || this.guides())) {
        const thX = SNAP_PX / rect.width;
        const thY = SNAP_PX / rect.height;
        const sx = this.snapAxis(
          [x, x + start.width / 2, x + start.width],
          this.buildTargets('x', start),
          thX,
        );
        if (sx) {
          x += sx.delta;
          if (sx.guidePos !== null) active.push({ axis: 'x', pos: sx.guidePos });
        }
        const sy = this.snapAxis(
          [y, y + start.height / 2, y + start.height],
          this.buildTargets('y', start),
          thY,
        );
        if (sy) {
          y += sy.delta;
          if (sy.guidePos !== null) active.push({ axis: 'y', pos: sy.guidePos });
        }
      }
      this.guideLines.set(active);
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
      // Snap to 15° steps when snapping is on (or Shift held); Alt overrides.
      if ((this.snap() || e.shiftKey) && !e.altKey) deg = Math.round(deg / 15) * 15;
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
      // Snap resize (only for un-rotated layers): the dragged corner snaps to
      // grid lines and/or sibling & canvas edges, and the photo cover-fills the
      // snapped cell — this is how you build flush, uniform cells by hand.
      if ((this.snap() || this.guides()) && !e.altKey && start.rotation === 0) {
        const thX = SNAP_PX / rect.width;
        const thY = SNAP_PX / rect.height;
        let cornerX = (sx > 0 ? start.pos_x + start.width : start.pos_x) + dxPx / rect.width;
        let cornerY = (sy > 0 ? start.pos_y + start.height : start.pos_y) + dyPx / rect.height;
        const active: GuideLine[] = [];
        const snX = this.snapAxis([cornerX], this.buildTargets('x', start), thX);
        if (snX) {
          cornerX += snX.delta;
          if (snX.guidePos !== null) active.push({ axis: 'x', pos: snX.guidePos });
        }
        const snY = this.snapAxis([cornerY], this.buildTargets('y', start), thY);
        if (snY) {
          cornerY += snY.delta;
          if (snY.guidePos !== null) active.push({ axis: 'y', pos: snY.guidePos });
        }
        this.guideLines.set(active);
        const fixedX = sx > 0 ? start.pos_x : start.pos_x + start.width;
        const fixedY = sy > 0 ? start.pos_y : start.pos_y + start.height;
        const nw = Math.max(MIN_SIZE, Math.abs(cornerX - fixedX));
        const nh = Math.max(MIN_SIZE, Math.abs(cornerY - fixedY));
        const nx = sx > 0 ? fixedX : fixedX - nw;
        const ny = sy > 0 ? fixedY : fixedY - nh;
        const cellAspect = (nw / nh) * (rect.width / rect.height);
        this.patchLocal(d.layer, {
          pos_x: nx,
          pos_y: ny,
          width: nw,
          height: nh,
          ...this.coverCrop(cellAspect, this.sourceAspect(start)),
        });
        return;
      }
      // Free resize: aspect-locked, crop untouched.
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
    const moved = this.drag !== null && this.dragMoved;
    this.drag = null;
    this.dragMoved = false;
    if (this.guideLines().length) this.guideLines.set([]);
    if (moved) this.commit('drag');
  }

  // ── Keyboard ──
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;

    // Undo/redo and zoom shortcuts work with no selection.
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') return (e.preventDefault(), e.shiftKey ? this.redo() : this.undo());
      if (k === 'y') return (e.preventDefault(), this.redo());
      if (e.key === '=' || e.key === '+') return (e.preventDefault(), this.zoomBy(1));
      if (e.key === '-') return (e.preventDefault(), this.zoomBy(-1));
      if (e.key === '0') return (e.preventDefault(), this.resetZoom());
    }

    const l = this.selectedLayer();
    if (!l) return;

    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      this.duplicate(l);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.removeLayer(l);
      return;
    }
    // Arrow nudges: one grid cell when snapping, otherwise fine (Shift = 5%).
    const stepX = this.snap() ? this.stepX() : e.shiftKey ? 0.05 : 0.01;
    const stepY = this.snap() ? this.stepY() : e.shiftKey ? 0.05 : 0.01;
    const nudge: Record<string, CollageLayerInput> = {
      ArrowLeft: { pos_x: l.pos_x - stepX },
      ArrowRight: { pos_x: l.pos_x + stepX },
      ArrowUp: { pos_y: l.pos_y - stepY },
      ArrowDown: { pos_y: l.pos_y + stepY },
    };
    if (nudge[e.key]) {
      e.preventDefault();
      this.patchLocal(l, nudge[e.key]);
      this.commit('nudge');
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
          this.commit('add');
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
              this.commit('add');
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
    this.commit('delete');
    this.api.deleteCollageLayer(c.id, l.id).subscribe({
      error: () => this.error.set('Could not delete layer.'),
    });
  }

  toggleBorder(l: CollageLayer): void {
    this.patchLocal(l, { border_enabled: !l.border_enabled });
    this.commit('border');
  }

  /** Clone a layer, offset by one grid step so the copy is visible. */
  duplicate(l: CollageLayer): void {
    const c = this.collage();
    if (!c) return;
    const maxZ = Math.max(0, ...this.layers().map((x) => x.z_index));
    const body: CollageLayerInput = {
      pos_x: l.pos_x + this.stepX(),
      pos_y: l.pos_y + this.stepY(),
      width: l.width,
      height: l.height,
      rotation: l.rotation,
      crop_x: l.crop_x,
      crop_y: l.crop_y,
      crop_width: l.crop_width,
      crop_height: l.crop_height,
      border_enabled: l.border_enabled,
      z_index: maxZ + 1,
    };
    if (l.photo_id) body.photo_id = l.photo_id;
    else if (l.one_off_path) body.one_off_path = l.one_off_path;
    this.api.addCollageLayer(c.id, body).subscribe({
      next: (layer) => {
        this.layers.set([...this.layers(), layer]);
        this.selected.set(layer.id);
        this.commit('add');
      },
      error: () => this.error.set('Could not duplicate layer.'),
    });
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
    this.commit('crop');
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
    this.commit('reorder');
  }

  // ── Background ──
  setBackground(color: string): void {
    const c = this.collage();
    if (!c) return;
    this.collage.set({ ...c, background_color: color });
    this.commit('bg');
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

  // ── Undo / redo ──
  private snapshot(): Snapshot {
    return {
      background: this.collage()?.background_color ?? '#000000',
      layers: this.layers().map((l) => ({ ...l })),
    };
  }

  /** Seed history from the current state (on load, and after an export resets
   *  the baseline since one-off layers are purged server-side). */
  private resetHistory(): void {
    this.history = [this.snapshot()];
    this.histIndex = 0;
    this.lastKind = '';
    this.lastCommitAt = 0;
    this.syncHistFlags();
  }

  private syncHistFlags(): void {
    this.canUndo.set(this.histIndex > 0);
    this.canRedo.set(this.histIndex < this.history.length - 1);
  }

  /** Record the current state as one undo step. Rapid same-kind ops in the
   *  COALESCE set (nudges, colour-picker drags) fold into the top entry. */
  private commit(kind: string): void {
    const snap = this.snapshot();
    const top = this.history[this.histIndex];
    if (top && JSON.stringify(top) === JSON.stringify(snap)) return; // no-op
    const now = Date.now();
    if (
      this.COALESCE.has(kind) &&
      this.lastKind === kind &&
      now - this.lastCommitAt < 600 &&
      this.histIndex >= 0
    ) {
      this.history[this.histIndex] = snap; // fold into current entry
    } else {
      this.history = this.history.slice(0, this.histIndex + 1); // drop redo tail
      this.history.push(snap);
      if (this.history.length > 50) this.history.shift();
      this.histIndex = this.history.length - 1;
    }
    this.lastKind = kind;
    this.lastCommitAt = now;
    this.syncHistFlags();
  }

  undo(): void {
    if (this.histIndex <= 0) return;
    this.histIndex--;
    this.applySnapshot(this.history[this.histIndex]);
    this.syncHistFlags();
  }
  redo(): void {
    if (this.histIndex >= this.history.length - 1) return;
    this.histIndex++;
    this.applySnapshot(this.history[this.histIndex]);
    this.syncHistFlags();
  }

  /** Persist any pending edits, then reconcile local + server to `target`. */
  private applySnapshot(target: Snapshot): void {
    this.flushNow().subscribe({
      next: () => this.reconcile(target),
      error: () => this.reconcile(target),
    });
  }

  private geom(l: CollageLayer): CollageLayerInput {
    return {
      pos_x: l.pos_x,
      pos_y: l.pos_y,
      width: l.width,
      height: l.height,
      rotation: l.rotation,
      crop_x: l.crop_x,
      crop_y: l.crop_y,
      crop_width: l.crop_width,
      crop_height: l.crop_height,
      border_enabled: l.border_enabled,
      z_index: l.z_index,
    };
  }
  private geomDiffers(a: CollageLayer, b: CollageLayer): boolean {
    return (
      a.pos_x !== b.pos_x ||
      a.pos_y !== b.pos_y ||
      a.width !== b.width ||
      a.height !== b.height ||
      a.rotation !== b.rotation ||
      a.crop_x !== b.crop_x ||
      a.crop_y !== b.crop_y ||
      a.crop_width !== b.crop_width ||
      a.crop_height !== b.crop_height ||
      a.border_enabled !== b.border_enabled ||
      a.z_index !== b.z_index
    );
  }

  /** Bring the live editor + server to `target`: PATCH changed layers, DELETE
   *  layers that shouldn't exist, POST (recreate) ones that should. Recreated
   *  layers get a new server id, remapped across the whole history. */
  private reconcile(target: Snapshot): void {
    const c = this.collage();
    if (!c) return;
    const current = this.layers();
    const tgtIds = new Set(target.layers.map((l) => l.id));
    const curIds = new Set(current.map((l) => l.id));
    const curById = new Map(current.map((l) => [l.id, l] as const));

    // Optimistic UI: show the target straight away.
    this.layers.set(target.layers.map((l) => ({ ...l })));
    if (this.selected() && !tgtIds.has(this.selected()!)) this.selected.set(null);

    const ops: Observable<unknown>[] = [];
    if ((this.collage()?.background_color ?? '') !== target.background) {
      this.collage.set({ ...this.collage()!, background_color: target.background });
      ops.push(this.api.updateCollage(c.id, { background_color: target.background }));
    }
    for (const l of current) {
      if (!tgtIds.has(l.id)) ops.push(this.api.deleteCollageLayer(c.id, l.id));
    }
    for (const l of target.layers) {
      const cur = curById.get(l.id);
      if (cur && this.geomDiffers(cur, l)) {
        ops.push(this.api.updateCollageLayer(c.id, l.id, this.geom(l)));
      }
      if (!curIds.has(l.id)) {
        const body: CollageLayerInput = { ...this.geom(l) };
        if (l.photo_id) body.photo_id = l.photo_id;
        else if (l.one_off_path) body.one_off_path = l.one_off_path;
        const oldId = l.id;
        ops.push(
          this.api
            .addCollageLayer(c.id, body)
            .pipe(tap((created) => this.remapId(oldId, created.id))),
        );
      }
    }

    if (!ops.length) {
      this.saveState.set('saved');
      return;
    }
    this.saveState.set('saving');
    forkJoin(ops).subscribe({
      next: () => this.saveState.set('saved'),
      error: () => this.error.set('Undo/redo could not fully sync to the server.'),
    });
  }

  /** A recreated layer got a fresh server id — replace the old id everywhere it
   *  is referenced so future undo/redo stay consistent. */
  private remapId(oldId: string, newId: string): void {
    this.layers.set(
      this.layers().map((l) => (l.id === oldId ? { ...l, id: newId } : l)),
    );
    for (const snap of this.history) {
      snap.layers = snap.layers.map((l) =>
        l.id === oldId ? { ...l, id: newId } : l,
      );
    }
    if (this.selected() === oldId) this.selected.set(newId);
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
            // One-off layers are purged server-side on export — re-sync and
            // reset undo history (can't undo across the purge).
            this.api.getCollage(c.id).subscribe({
              next: (fresh) => {
                this.collage.set(fresh);
                this.layers.set([...fresh.layers]);
                this.resetHistory();
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
