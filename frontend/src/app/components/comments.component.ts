import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CommentContext, CommentItem } from '../models';
import { ApiService } from '../services/api.service';
import { CapyIconComponent } from './capy-icon.component';

const MAX_LEN = 1000;

/**
 * A comment thread for one context (a gallery, a photo in a gallery, or a
 * photo in the portfolio). Top-level comments oldest-first, each with one
 * level of replies. Authors can edit/delete their own; admin can delete any.
 * Bodies are rendered with interpolation (escaped), never as HTML.
 */
@Component({
  selector: 'app-comments',
  standalone: true,
  imports: [CommonModule, FormsModule, CapyIconComponent],
  template: `
    <div class="thread">
      <p class="state muted" *ngIf="loading()">Loading comments…</p>
      <p class="state err" *ngIf="loadError()">
        Couldn't load comments. <button class="link" (click)="load()">Retry</button>
      </p>
      <p class="state muted" *ngIf="!loading() && !loadError() && !comments().length">
        {{ emptyText }}
      </p>

      <ul class="list" *ngIf="comments().length">
        <li *ngFor="let c of comments(); trackBy: trackId" class="item">
          <ng-container
            *ngTemplateOutlet="one; context: { $implicit: c, parent: null }"
          ></ng-container>
          <ul class="replies" *ngIf="c.replies.length">
            <li *ngFor="let r of c.replies; trackBy: trackId" class="item reply">
              <ng-container
                *ngTemplateOutlet="one; context: { $implicit: r, parent: c }"
              ></ng-container>
            </li>
          </ul>
          <form
            class="composer reply-composer"
            *ngIf="replyingTo() === c.id"
            (ngSubmit)="post(c.id)"
          >
            <textarea
              name="reply"
              rows="2"
              [maxlength]="maxLen"
              [(ngModel)]="replyDraft"
              placeholder="Write a reply…"
              (keydown)="onKeydown($event, c.id)"
            ></textarea>
            <div class="row">
              <button class="link" type="button" (click)="replyingTo.set(null)">cancel</button>
              <button class="btn-accent small" type="submit" [disabled]="busy() || !replyDraft.trim()">
                Reply
              </button>
            </div>
          </form>
        </li>
      </ul>

      <form class="composer" (ngSubmit)="post()">
        <textarea
          name="draft"
          rows="2"
          [maxlength]="maxLen"
          [(ngModel)]="draft"
          [placeholder]="placeholder"
          (keydown)="onKeydown($event)"
        ></textarea>
        <div class="row">
          <span class="mono muted count" *ngIf="draft.length > maxLen - 150">
            {{ maxLen - draft.length }}
          </span>
          <span class="err" *ngIf="postError()">{{ postError() }}</span>
          <button class="btn-accent small" type="submit" [disabled]="busy() || !draft.trim()">
            {{ busy() ? 'Posting…' : 'Post' }}
          </button>
        </div>
      </form>
    </div>

    <ng-template #one let-c let-parent="parent">
      <div class="head">
        <b class="who">{{ c.author.username }}</b>
        <span class="badge mono" *ngIf="c.author.is_admin">
          <app-capy-icon [size]="11"></app-capy-icon> captionato
        </span>
        <span class="when mono muted" [title]="c.created_at | date: 'medium'">
          {{ ago(c.created_at) }}<ng-container *ngIf="c.edited_at"> · edited</ng-container>
        </span>
      </div>

      <form class="composer edit" *ngIf="editingId() === c.id; else bodyTpl" (ngSubmit)="saveEdit(c)">
        <textarea name="edit" rows="2" [maxlength]="maxLen" [(ngModel)]="editDraft"></textarea>
        <div class="row">
          <button class="link" type="button" (click)="editingId.set(null)">cancel</button>
          <button class="btn-accent small" type="submit" [disabled]="busy() || !editDraft.trim()">Save</button>
        </div>
      </form>
      <ng-template #bodyTpl><p class="body">{{ c.body }}</p></ng-template>

      <div class="actions" *ngIf="editingId() !== c.id">
        <button class="link" type="button" (click)="startReply(parent ?? c)">reply</button>
        <button class="link" type="button" *ngIf="c.mine" (click)="startEdit(c)">edit</button>
        <button class="link danger" type="button" *ngIf="c.can_delete" (click)="remove(c, parent)">
          delete
        </button>
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .thread {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
      .state {
        margin: 0;
        font-size: 0.85rem;
      }
      .muted {
        color: var(--color-muted);
      }
      .err {
        color: var(--color-accent);
        font-size: 0.8rem;
      }
      .list,
      .replies {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
      .replies {
        margin-top: 0.7rem;
        padding-left: 0.9rem;
        border-left: 2px solid var(--color-border);
        gap: 0.7rem;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.2rem 0.5rem;
      }
      .who {
        font-family: var(--font-display);
        font-size: 0.9rem;
        color: var(--color-ink);
        overflow-wrap: anywhere;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-accent);
      }
      .when {
        font-size: 0.7rem;
      }
      .body {
        margin: 0.25rem 0 0;
        font-size: 0.9rem;
        line-height: 1.5;
        color: var(--color-ink);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .actions {
        display: flex;
        gap: 0.9rem;
        margin-top: 0.3rem;
        font-size: 0.75rem;
      }
      .link {
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        color: var(--color-muted);
        cursor: pointer;
      }
      .link:hover {
        color: var(--color-ink);
      }
      .link.danger:hover {
        color: var(--color-accent);
      }
      .composer {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .reply-composer {
        margin: 0.6rem 0 0 0.9rem;
      }
      .edit {
        margin-top: 0.3rem;
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-body);
        font-size: 0.9rem;
        padding: 0.55rem 0.65rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
        resize: vertical;
        min-height: 2.6rem;
      }
      textarea:focus {
        outline: 2px solid var(--color-accent);
        border-color: transparent;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.8rem;
      }
      .count {
        font-size: 0.7rem;
        margin-right: auto;
      }
      .small {
        padding: 0.35rem 0.9rem;
        font-size: 0.85rem;
      }
    `,
  ],
})
export class CommentsComponent implements OnChanges {
  @Input({ required: true }) galleryId: string | null = null;
  @Input() photoId: string | null = null;
  @Input() placeholder = 'Say something nice…';
  @Input() emptyText = 'No comments yet — be the first.';
  /** Total comments + replies, so parents can update their count badges. */
  @Output() countChange = new EventEmitter<number>();

  readonly maxLen = MAX_LEN;
  comments = signal<CommentItem[]>([]);
  loading = signal(false);
  loadError = signal(false);
  busy = signal(false);
  postError = signal('');
  replyingTo = signal<string | null>(null);
  editingId = signal<string | null>(null);
  draft = '';
  replyDraft = '';
  editDraft = '';

  trackId = (_: number, c: CommentItem) => c.id;

  constructor(private api: ApiService) {}

  private get ctx() {
    return { gallery_id: this.galleryId, photo_id: this.photoId };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['galleryId'] || changes['photoId']) {
      this.draft = '';
      this.replyingTo.set(null);
      this.editingId.set(null);
      this.postError.set('');
      this.load();
    }
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.comments.set([]);
    const asked = this.ctx;
    this.api.getComments(asked).subscribe({
      next: (list) => {
        // Ignore a late response for a photo we've already navigated away from.
        if (asked.photo_id !== this.photoId || asked.gallery_id !== this.galleryId) return;
        this.comments.set(list);
        this.loading.set(false);
        this.emitCount();
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  /** Enter posts, Shift+Enter is a newline. Keys never reach the lightbox. */
  onKeydown(e: KeyboardEvent, parentId?: string): void {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.post(parentId);
    }
  }

  post(parentId?: string): void {
    const text = (parentId ? this.replyDraft : this.draft).trim();
    if (!text || this.busy()) return;
    this.busy.set(true);
    this.postError.set('');
    this.api.postComment(this.ctx, text, parentId).subscribe({
      next: (c) => {
        if (parentId) {
          this.comments.update((list) =>
            list.map((p) => (p.id === parentId ? { ...p, replies: [...p.replies, c] } : p)),
          );
          this.replyDraft = '';
          this.replyingTo.set(null);
        } else {
          this.comments.update((list) => [...list, c]);
          this.draft = '';
        }
        this.busy.set(false);
        this.emitCount();
      },
      error: (e) => {
        this.busy.set(false);
        this.postError.set(
          e.status === 429 ? 'Easy there — try again in a minute.' : "Couldn't post that. Try again?",
        );
      },
    });
  }

  startReply(target: CommentItem): void {
    this.editingId.set(null);
    this.replyDraft = '';
    this.replyingTo.set(target.id);
  }

  startEdit(c: CommentItem): void {
    this.replyingTo.set(null);
    this.editDraft = c.body;
    this.editingId.set(c.id);
  }

  saveEdit(c: CommentItem): void {
    const text = this.editDraft.trim();
    if (!text || this.busy()) return;
    this.busy.set(true);
    this.api.editComment(c.id, text).subscribe({
      next: (fresh) => {
        this.replace(c.id, (old) => ({ ...fresh, replies: old.replies }));
        this.editingId.set(null);
        this.busy.set(false);
      },
      error: () => this.busy.set(false),
    });
  }

  remove(c: CommentItem, parent: CommentItem | null): void {
    const msg = !parent && c.replies.length
      ? 'Delete this comment and its replies?'
      : 'Delete this comment?';
    if (!confirm(msg)) return;
    this.api.deleteComment(c.id).subscribe({
      next: () => {
        if (parent) {
          this.replace(parent.id, (p) => ({ ...p, replies: p.replies.filter((r) => r.id !== c.id) }));
        } else {
          this.comments.update((list) => list.filter((x) => x.id !== c.id));
        }
        this.emitCount();
      },
    });
  }

  /** Compact relative time: "just now", "5m", "3h", "2d", then a date. */
  ago(iso: string): string {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)}d`;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  private replace(id: string, fn: (c: CommentItem) => CommentItem): void {
    this.comments.update((list) =>
      list.map((p) =>
        p.id === id ? fn(p) : { ...p, replies: p.replies.map((r) => (r.id === id ? fn(r) : r)) },
      ),
    );
  }

  private emitCount(): void {
    this.countChange.emit(
      this.comments().reduce((n, c) => n + 1 + c.replies.length, 0),
    );
  }
}
