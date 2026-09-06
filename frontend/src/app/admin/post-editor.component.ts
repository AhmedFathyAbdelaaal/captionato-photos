import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Collage, CollageLayer, PostDetail, SlideFormat } from '../models';
import { ApiService } from '../services/api.service';
import { CollageEditorComponent } from './collage-editor.component';
import { SlidePreviewComponent } from './slide-preview.component';

const SIZE_LABEL: Record<string, string> = {
  square: '1:1',
  portrait: '4:5',
  landscape: '1.91:1',
  post: '1:1',
  story: '9:16',
};

@Component({
  selector: 'app-post-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CollageEditorComponent,
    SlidePreviewComponent,
  ],
  template: `
    <div class="page" *ngIf="post() as p">
      <!-- Top bar -->
      <header class="bar">
        <a class="back" routerLink="/admin/posts" title="Back to posts">←</a>
        <input
          class="name"
          [(ngModel)]="p.name"
          (blur)="saveName(p)"
          (keydown.enter)="saveName(p)"
          name="postname"
          maxlength="120"
        />
        <span class="mono muted count">{{ p.slides.length }} slide{{ p.slides.length === 1 ? '' : 's' }}</span>
        <span class="save mono" *ngIf="statusMsg()">{{ statusMsg() }}</span>
        <div class="bar-right">
          <button class="btn-ghost" (click)="previewOpen.set(true)">◫ Preview</button>
          <button class="btn-accent" [disabled]="exporting()" (click)="exportPost('jpg')">
            {{ exporting() ? 'Exporting…' : '⬇ Export ZIP' }}
          </button>
          <button class="btn-ghost" [disabled]="exporting()" (click)="exportPost('png')">PNG</button>
        </div>
      </header>
      <p class="err" *ngIf="error()">{{ error() }}</p>

      <div class="cols">
        <!-- Slide rail -->
        <aside class="rail">
          <div
            class="slide"
            *ngFor="let s of p.slides; let i = index"
            [class.on]="selectedId() === s.id"
            [class.dragging]="dragIndex() === i"
            draggable="true"
            (dragstart)="onDragStart(i)"
            (dragover)="onDragOver($event, i)"
            (drop)="onDrop()"
            (dragend)="onDragEnd()"
            (click)="select(s.id)"
          >
            <span class="num mono">{{ i + 1 }}</span>
            <app-slide-preview [slide]="s"></app-slide-preview>
            <span class="size mono">{{ sizeLabel(s.format) }}</span>
            <button
              class="del"
              (click)="removeSlide(s, $event)"
              [disabled]="p.slides.length <= 1"
              title="Delete slide"
            >✕</button>
          </div>

          <!-- Add slide -->
          <div class="add">
            <button class="add-btn" (click)="addMenu.set(!addMenu())">＋ Add slide</button>
            <div class="add-menu" *ngIf="addMenu()">
              <button (click)="addSlide('square')"><b>Square</b><small>1:1</small></button>
              <button (click)="addSlide('portrait')"><b>Portrait</b><small>4:5</small></button>
              <button (click)="addSlide('landscape')"><b>Landscape</b><small>1.91:1</small></button>
            </div>
          </div>
        </aside>

        <!-- Focused slide editor -->
        <section class="editor">
          <app-collage-editor
            *ngIf="selectedId() as sid"
            [collageId]="sid"
            [embedded]="true"
            (slideChange)="onSlideChange($event)"
          ></app-collage-editor>
        </section>
      </div>
    </div>

    <p class="hint" *ngIf="loading()">loading…</p>
    <p class="hint" *ngIf="notFound()">Post not found. <a routerLink="/admin/posts">Back</a></p>

    <!-- Preview overlay -->
    <div class="pv-backdrop" *ngIf="previewOpen() && post() as p" (click)="previewOpen.set(false)">
      <div class="pv" (click)="$event.stopPropagation()">
        <header class="pv-head">
          <strong>{{ p.name }} — preview</strong>
          <span class="muted small">how the carousel reads, left → right</span>
          <button class="btn-ghost" (click)="previewOpen.set(false)">✕</button>
        </header>
        <div class="pv-strip">
          <figure class="pv-slide" *ngFor="let s of p.slides; let i = index">
            <app-slide-preview [slide]="s"></app-slide-preview>
            <figcaption class="mono">{{ i + 1 }} · {{ sizeLabel(s.format) }}</figcaption>
          </figure>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .bar {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        margin-bottom: 0.8rem;
        flex-wrap: wrap;
      }
      .back {
        font-size: 1.3rem;
        width: 2.1rem; height: 2.1rem;
        display: grid; place-items: center;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      .name {
        font-family: var(--font-display);
        font-weight: 800;
        letter-spacing: -0.02em;
        font-size: 1.2rem;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius);
        padding: 0.3rem 0.5rem;
        color: var(--color-ink);
        min-width: 12rem;
      }
      .name:hover, .name:focus {
        border-color: var(--color-border);
        background: var(--color-paper);
        outline: none;
      }
      .count { font-size: 0.78rem; }
      .save { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cap-capy); }
      .muted { color: var(--color-muted); }
      .err { color: var(--color-accent); margin: 0 0 0.6rem; }
      .bar-right { margin-left: auto; display: flex; gap: 0.5rem; flex-wrap: wrap; }

      .cols {
        display: grid;
        grid-template-columns: 160px 1fr;
        gap: 1rem;
        align-items: start;
      }
      /* Slide rail */
      .rail {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        position: sticky;
        top: 0.5rem;
        max-height: calc(100vh - 1rem);
        overflow-y: auto;
        padding: 0.2rem;
      }
      .slide {
        position: relative;
        border: 2px solid var(--color-border);
        border-radius: calc(var(--radius) + 2px);
        padding: 0.4rem;
        cursor: pointer;
        background: var(--color-surface);
        transition: border-color 0.15s var(--ease), transform 0.15s var(--ease);
      }
      .slide:hover { border-color: var(--cap-capy); }
      .slide.on { border-color: var(--color-accent); }
      .slide.dragging { opacity: 0.4; }
      .slide .num {
        position: absolute;
        top: 0.5rem; left: 0.5rem;
        z-index: 2;
        font-size: 0.7rem;
        width: 1.3rem; height: 1.3rem;
        display: grid; place-items: center;
        border-radius: 50%;
        background: color-mix(in srgb, var(--cap-ink) 66%, transparent);
        color: var(--cap-cream-hi);
      }
      .slide .size {
        display: block;
        text-align: center;
        margin-top: 0.3rem;
        font-size: 0.66rem;
        color: var(--color-muted);
        letter-spacing: 0.06em;
      }
      .slide .del {
        position: absolute;
        top: 0.4rem; right: 0.4rem;
        z-index: 2;
        width: 1.4rem; height: 1.4rem;
        border: none; border-radius: 50%;
        background: color-mix(in srgb, var(--cap-ink) 60%, transparent);
        color: var(--cap-cream-hi);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s var(--ease);
      }
      .slide:hover .del { opacity: 1; }
      .slide .del:hover { background: var(--cap-ember); }
      .slide .del:disabled { opacity: 0 !important; }

      .add { position: relative; }
      .add-btn {
        width: 100%;
        padding: 0.7rem;
        border: 2px dashed var(--color-border);
        border-radius: calc(var(--radius) + 2px);
        background: transparent;
        color: var(--color-muted);
        cursor: pointer;
        font-family: var(--font-display);
        font-weight: 700;
      }
      .add-btn:hover { border-color: var(--cap-brass); color: var(--cap-brass-deep); }
      .add-menu {
        margin-top: 0.4rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.4rem;
      }
      .add-menu button {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 0.5rem;
        padding: 0.45rem 0.6rem;
        border: none;
        background: var(--color-paper);
        border-radius: var(--radius);
        cursor: pointer;
        color: var(--color-ink);
      }
      .add-menu button:hover { background: var(--cap-ember); color: var(--cap-cream-hi); }
      .add-menu b { font-family: var(--font-display); }
      .add-menu small { color: var(--color-muted); font-family: var(--font-mono); font-size: 0.7rem; }
      .add-menu button:hover small { color: var(--cap-cream-hi); }

      .editor { min-width: 0; }

      /* Preview overlay */
      .pv-backdrop {
        position: fixed; inset: 0; z-index: 300;
        display: grid; place-items: center;
        padding: 1.5rem;
        background: color-mix(in srgb, var(--cap-ink) 62%, transparent);
        backdrop-filter: blur(5px);
      }
      .pv {
        width: min(1100px, 100%);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        border-radius: calc(var(--radius) * 3);
        padding: 1.3rem;
      }
      .pv-head {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
      }
      .pv-head strong { font-family: var(--font-display); font-weight: 800; font-size: 1.2rem; }
      .pv-head .btn-ghost { margin-left: auto; }
      .small { font-size: 0.8rem; }
      .pv-strip {
        display: flex;
        gap: 1rem;
        overflow-x: auto;
        padding-bottom: 0.6rem;
        align-items: flex-start;
      }
      .pv-slide {
        margin: 0;
        flex: 0 0 auto;
        width: clamp(180px, 26vw, 300px);
      }
      .pv-slide figcaption {
        text-align: center;
        margin-top: 0.4rem;
        font-size: 0.72rem;
        color: var(--color-muted);
        letter-spacing: 0.06em;
      }

      .hint { text-align: center; color: var(--color-muted); font-family: var(--font-mono); padding: 3rem; }

      @media (max-width: 820px) {
        .cols { grid-template-columns: 1fr; }
        .rail {
          flex-direction: row;
          position: static;
          max-height: none;
          overflow-x: auto;
        }
        .slide { flex: 0 0 120px; }
        .add { flex: 0 0 120px; }
      }
    `,
  ],
})
export class PostEditorComponent implements OnInit {
  @ViewChild(CollageEditorComponent) editor?: CollageEditorComponent;

  post = signal<PostDetail | null>(null);
  loading = signal(true);
  notFound = signal(false);
  selectedId = signal<string | null>(null);
  previewOpen = signal(false);
  addMenu = signal(false);
  exporting = signal(false);
  error = signal('');
  statusMsg = signal('');
  dragIndex = signal<number | null>(null);

  private postId = '';

  constructor(
    public api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.postId = this.route.snapshot.paramMap.get('id')!;
    this.api.getPost(this.postId).subscribe({
      next: (p) => {
        this.post.set(p);
        this.selectedId.set(p.slides[0]?.id ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
  }

  sizeLabel(fmt: string): string {
    return SIZE_LABEL[fmt] ?? fmt;
  }

  select(id: string): void {
    if (this.selectedId() === id) return;
    this.selectedId.set(id);
  }

  saveName(p: PostDetail): void {
    const name = p.name.trim();
    if (!name) return;
    this.api.updatePost(p.id, { name }).subscribe({ next: () => this.flashStatus('saved') });
  }

  /** Live sync from the embedded editor: replace that slide's layers + bg so the
   *  rail and preview reflect edits immediately. Matched by slide id. */
  onSlideChange(e: { id: string; background_color: string; layers: CollageLayer[] }): void {
    this.post.update((p) => {
      if (!p) return p;
      return {
        ...p,
        slides: p.slides.map((s) =>
          s.id === e.id
            ? { ...s, background_color: e.background_color, layers: e.layers }
            : s,
        ),
      };
    });
  }

  addSlide(format: SlideFormat): void {
    this.addMenu.set(false);
    this.api.addSlide(this.postId, format).subscribe({
      next: (fresh) => {
        this.post.set(fresh);
        // Select the newly-added (last) slide.
        const last = fresh.slides[fresh.slides.length - 1];
        if (last) this.selectedId.set(last.id);
      },
      error: (err) => this.error.set(err.error?.detail || 'Could not add slide.'),
    });
  }

  removeSlide(s: Collage, ev: Event): void {
    ev.stopPropagation();
    const p = this.post();
    if (!p || p.slides.length <= 1) return;
    if (!confirm('Delete this slide?')) return;
    this.api.deleteSlide(this.postId, s.id).subscribe({
      next: () => {
        const remaining = p.slides.filter((x) => x.id !== s.id);
        this.post.update((cur) => (cur ? { ...cur, slides: remaining } : cur));
        if (this.selectedId() === s.id) {
          this.selectedId.set(remaining[0]?.id ?? null);
        }
      },
      error: (err) => this.error.set(err.error?.detail || 'Could not delete slide.'),
    });
  }

  // ── Drag reorder ──
  onDragStart(i: number): void {
    this.dragIndex.set(i);
  }
  onDragOver(e: DragEvent, i: number): void {
    e.preventDefault();
    const from = this.dragIndex();
    if (from === null || from === i) return;
    this.post.update((p) => {
      if (!p) return p;
      const slides = [...p.slides];
      const [moved] = slides.splice(from, 1);
      slides.splice(i, 0, moved);
      return { ...p, slides };
    });
    this.dragIndex.set(i);
  }
  onDrop(): void {
    this.persistOrder();
  }
  onDragEnd(): void {
    if (this.dragIndex() !== null) this.persistOrder();
    this.dragIndex.set(null);
  }
  private persistOrder(): void {
    const p = this.post();
    if (!p) return;
    this.api.reorderSlides(p.id, p.slides.map((s) => s.id)).subscribe({
      next: () => this.flashStatus('saved'),
    });
  }

  // ── Export ──
  exportPost(format: 'jpg' | 'png'): void {
    const p = this.post();
    if (!p) return;
    this.exporting.set(true);
    this.error.set('');
    // Flush the focused slide's pending edits, then render + zip server-side.
    const flush = this.editor ? this.editor.saveNow() : null;
    const run = () =>
      this.api.exportPost(p.id, format).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.slug(p.name)}.zip`;
          a.click();
          URL.revokeObjectURL(url);
          this.exporting.set(false);
          // One-offs are purged server-side on export — re-sync the slides.
          this.api.getPost(p.id).subscribe({ next: (fresh) => this.post.set(fresh) });
        },
        error: (err) => {
          this.error.set(err.error?.detail || 'Export failed.');
          this.exporting.set(false);
        },
      });
    if (flush) flush.subscribe({ next: run, error: run });
    else run();
  }

  private slug(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'post'
    );
  }

  private flashStatus(msg: string): void {
    this.statusMsg.set(msg);
    setTimeout(() => {
      if (this.statusMsg() === msg) this.statusMsg.set('');
    }, 1600);
  }
}
