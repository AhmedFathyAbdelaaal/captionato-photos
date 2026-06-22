import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { Gallery, Photo } from '../models';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-admin-photos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="top">
      <h1>Photos</h1>
      <span class="count mono">{{ total() }} total</span>
    </header>

    <!-- Upload zone -->
    <label
      class="drop"
      [class.over]="dragOver()"
      (dragover)="$event.preventDefault(); dragOver.set(true)"
      (dragleave)="dragOver.set(false)"
      (drop)="onDrop($event)"
    >
      <input type="file" multiple accept="image/*" (change)="onPick($event)" hidden />
      <span *ngIf="!uploading()">Drag photos here, or click to choose</span>
      <span *ngIf="uploading()">Uploading {{ uploadCount() }}…</span>
    </label>
    <p class="err" *ngIf="error()">{{ error() }}</p>

    <!-- Photo grid -->
    <div class="grid">
      <article class="card" *ngFor="let p of photos()">
        <div class="thumb" [class.hidden]="!p.visible">
          <img [src]="api.imageUrl(p.thumbnail_url)" [alt]="p.filename" loading="lazy" />
          <button
            class="vis"
            (click)="toggleVisible(p)"
            [title]="p.visible ? 'Visible on archive' : 'Hidden'"
          >
            {{ p.visible ? '👁' : '🚫' }}
          </button>
          <button class="edit" (click)="editing.set(editing() === p.id ? null : p.id)">⋯</button>
        </div>

        <!-- Inline editor -->
        <div class="editor" *ngIf="editing() === p.id">
          <label>Title<input [(ngModel)]="p.title" placeholder="Untitled" /></label>
          <label>Caption<textarea [(ngModel)]="p.caption" rows="2"></textarea></label>
          <fieldset>
            <legend>Galleries</legend>
            <label class="chk" *ngFor="let g of galleries()">
              <input
                type="checkbox"
                [checked]="inGallery(p, g.id)"
                (change)="toggleGallery(p, g.id, $event)"
              />
              {{ g.name }}
            </label>
            <p class="muted" *ngIf="galleries().length === 0">No galleries yet.</p>
          </fieldset>
          <div class="actions">
            <button class="btn-accent" (click)="save(p)">Save</button>
            <button class="btn-ghost danger" (click)="remove(p)">Delete</button>
          </div>
        </div>
      </article>
    </div>

    <p class="muted" *ngIf="!loading() && photos().length === 0">
      No photos yet — upload some above.
    </p>
  `,
  styles: [
    `
      .top {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
      }
      .count {
        color: var(--color-muted);
        font-size: 0.85rem;
      }
      .drop {
        display: grid;
        place-items: center;
        padding: 2rem;
        margin: 1.2rem 0;
        border: 2px dashed var(--color-border);
        border-radius: var(--radius);
        color: var(--color-muted);
        cursor: pointer;
        transition: border-color 0.2s var(--ease), color 0.2s var(--ease);
      }
      .drop.over {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
      .err {
        color: var(--color-accent);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .thumb {
        position: relative;
        aspect-ratio: 1;
        background: var(--color-paper);
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .thumb.hidden img {
        opacity: 0.4;
      }
      .vis,
      .edit {
        position: absolute;
        top: 0.4rem;
        border: none;
        border-radius: 50%;
        width: 2rem;
        height: 2rem;
        background: color-mix(in srgb, var(--color-paper) 80%, transparent);
        backdrop-filter: blur(4px);
      }
      .vis {
        left: 0.4rem;
      }
      .edit {
        right: 0.4rem;
        font-weight: 700;
      }
      .editor {
        padding: 0.8rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .editor label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.8rem;
        color: var(--color-muted);
      }
      input,
      textarea {
        font-family: var(--font-body);
        padding: 0.4rem 0.5rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
      }
      fieldset {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        font-size: 0.8rem;
      }
      legend {
        color: var(--color-muted);
        padding: 0 0.3rem;
      }
      .chk {
        flex-direction: row !important;
        align-items: center;
        gap: 0.4rem !important;
        color: var(--color-ink) !important;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
      }
      .danger {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }
      .muted {
        color: var(--color-muted);
      }
    `,
  ],
})
export class AdminPhotosComponent implements OnInit {
  photos = signal<Photo[]>([]);
  galleries = signal<Gallery[]>([]);
  total = signal(0);
  loading = signal(true);
  uploading = signal(false);
  uploadCount = signal(0);
  dragOver = signal(false);
  editing = signal<string | null>(null);
  error = signal('');

  constructor(public api: ApiService) {}

  ngOnInit(): void {
    forkJoin({
      photos: this.api.getAdminPhotos(1, 200),
      galleries: this.api.getGalleries(),
    }).subscribe({
      next: ({ photos, galleries }) => {
        this.photos.set(photos.items);
        this.total.set(photos.total);
        this.galleries.set(galleries);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.upload(Array.from(input.files));
    input.value = '';
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const files = e.dataTransfer?.files;
    if (files?.length) this.upload(Array.from(files));
  }

  private upload(files: File[]): void {
    this.uploading.set(true);
    this.uploadCount.set(files.length);
    this.error.set('');
    this.api.uploadPhotos(files).subscribe({
      next: (created) => {
        this.photos.update((cur) => [...created, ...cur]);
        this.total.update((t) => t + created.length);
        this.uploading.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.detail || 'Upload failed.');
        this.uploading.set(false);
      },
    });
  }

  toggleVisible(p: Photo): void {
    const next = !p.visible;
    this.api.updatePhoto(p.id, { visible: next }).subscribe(() => (p.visible = next));
  }

  inGallery(p: Photo, gid: string): boolean {
    return (p.gallery_ids ?? []).includes(gid);
  }

  toggleGallery(p: Photo, gid: string, e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    const set = new Set(p.gallery_ids ?? []);
    checked ? set.add(gid) : set.delete(gid);
    p.gallery_ids = Array.from(set);
  }

  save(p: Photo): void {
    this.api
      .updatePhoto(p.id, {
        title: p.title ?? null,
        caption: p.caption ?? null,
        gallery_ids: p.gallery_ids ?? [],
      })
      .subscribe(() => this.editing.set(null));
  }

  remove(p: Photo): void {
    if (!confirm(`Delete "${p.title || p.filename}"? This cannot be undone.`)) return;
    this.api.deletePhoto(p.id).subscribe(() => {
      this.photos.update((cur) => cur.filter((x) => x.id !== p.id));
      this.total.update((t) => t - 1);
      this.editing.set(null);
    });
  }
}
