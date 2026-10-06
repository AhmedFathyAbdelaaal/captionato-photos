import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CommentFeedItem } from '../models';
import { AdminStateService } from '../services/admin-state.service';
import { ApiService } from '../services/api.service';

/**
 * Every comment on the site, newest first, with where it lives. Opening the
 * tab marks everything read (the rows that were new stay highlighted for this
 * visit). Reply inline — replies land in the same thread — or delete.
 */
@Component({
  selector: 'app-admin-comments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="top">
      <h1>Comments</h1>
      <span class="mono muted" *ngIf="items().length">
        {{ items().length }} latest · {{ newCount() }} new
      </span>
    </header>

    <p class="muted" *ngIf="!loading() && !items().length">No comments yet.</p>

    <ul class="list">
      <li *ngFor="let c of items(); trackBy: trackId" class="row" [class.unread]="c.unread">
        <img
          class="thumb"
          *ngIf="c.photo"
          [src]="api.imageUrl(c.photo.thumbnail_url)"
          [alt]="c.photo.filename"
          loading="lazy"
        />
        <div class="thumb gal" *ngIf="!c.photo">▦</div>

        <div class="main">
          <div class="head">
            <b>{{ c.author.username }}</b>
            <span class="you mono" *ngIf="c.author.is_admin">you</span>
            <span class="mono muted when">{{ c.created_at | date: 'd MMM, HH:mm' }}</span>
            <span class="dot" *ngIf="c.unread" title="New"></span>
          </div>
          <p class="where muted">
            <span *ngIf="c.parent_id">↳ reply · </span>
            <ng-container *ngIf="c.photo && c.gallery">on a photo in <b>{{ c.gallery.name }}</b></ng-container>
            <ng-container *ngIf="!c.photo && c.gallery">on the gallery <b>{{ c.gallery.name }}</b></ng-container>
            <ng-container *ngIf="c.photo && !c.gallery">on a photo in the <b>portfolio</b></ng-container>
          </p>
          <p class="body">{{ c.body }}</p>

          <div class="actions">
            <a
              class="link"
              *ngIf="c.gallery"
              [routerLink]="['/galleries', c.gallery.slug]"
              [queryParams]="c.photo ? { photo: c.photo.id, comments: 1 } : {}"
              [fragment]="c.photo ? undefined : 'comments'"
              target="_blank"
            >open ↗</a>
            <button class="link" (click)="startReply(c)">reply</button>
            <button class="link danger" (click)="remove(c)">delete</button>
          </div>

          <form class="reply" *ngIf="replyingTo() === c.id" (ngSubmit)="sendReply(c)">
            <textarea
              name="reply"
              rows="2"
              maxlength="1000"
              [(ngModel)]="draft"
              placeholder="Reply as Captionato…"
            ></textarea>
            <div class="reply-row">
              <button class="link" type="button" (click)="replyingTo.set(null)">cancel</button>
              <button class="btn-accent small" type="submit" [disabled]="busy() || !draft.trim()">
                Reply
              </button>
            </div>
          </form>
        </div>
      </li>
    </ul>

    <div class="toast" *ngIf="toast()" role="status">{{ toast() }}</div>
  `,
  styles: [
    `
      .top {
        display: flex;
        align-items: baseline;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.2rem;
      }
      .top h1 {
        margin: 0;
      }
      .muted {
        color: var(--color-muted);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        max-width: 860px;
      }
      .row {
        display: grid;
        grid-template-columns: 64px 1fr;
        gap: 0.9rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.8rem;
      }
      .row.unread {
        border-color: var(--color-accent);
      }
      .thumb {
        width: 64px;
        height: 64px;
        object-fit: cover;
        border-radius: var(--radius);
        background: var(--color-paper);
      }
      .thumb.gal {
        display: grid;
        place-items: center;
        color: var(--color-muted);
        font-size: 1.4rem;
      }
      .main {
        min-width: 0;
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.2rem 0.6rem;
      }
      .head b {
        font-family: var(--font-display);
        overflow-wrap: anywhere;
      }
      .you {
        font-size: 0.7rem;
        color: var(--color-accent);
      }
      .when {
        font-size: 0.72rem;
      }
      .dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: var(--color-accent);
        align-self: center;
      }
      .where {
        margin: 0.15rem 0 0;
        font-size: 0.8rem;
      }
      .body {
        margin: 0.4rem 0 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 0.92rem;
      }
      .actions {
        display: flex;
        gap: 1rem;
        margin-top: 0.4rem;
        font-size: 0.8rem;
      }
      .link {
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        color: var(--color-muted);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .link.danger {
        color: var(--color-accent);
      }
      .reply {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-top: 0.6rem;
      }
      .reply textarea {
        font-family: var(--font-body);
        font-size: 0.9rem;
        padding: 0.5rem 0.6rem;
        background: var(--color-paper);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        color: var(--color-ink);
        resize: vertical;
      }
      .reply-row {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 0.8rem;
      }
      .small {
        padding: 0.35rem 0.9rem;
        font-size: 0.85rem;
      }
      .toast {
        position: fixed;
        bottom: 1.2rem;
        right: 1.2rem;
        z-index: 60;
        background: var(--color-ink);
        color: var(--color-paper);
        padding: 0.6rem 1rem;
        border-radius: var(--radius);
        font-size: 0.85rem;
      }
      @media (max-width: 520px) {
        .row {
          grid-template-columns: 44px 1fr;
          gap: 0.6rem;
        }
        .thumb {
          width: 44px;
          height: 44px;
        }
      }
    `,
  ],
})
export class AdminCommentsComponent implements OnInit {
  items = signal<CommentFeedItem[]>([]);
  loading = signal(true);
  newCount = signal(0);
  replyingTo = signal<string | null>(null);
  busy = signal(false);
  toast = signal('');
  draft = '';

  trackId = (_: number, c: CommentFeedItem) => c.id;

  constructor(public api: ApiService, private adminState: AdminStateService) {}

  ngOnInit(): void {
    this.load(true);
  }

  private load(markRead = false): void {
    this.api.getCommentFeed().subscribe({
      next: (feed) => {
        this.items.set(feed.items);
        this.newCount.set(feed.unread);
        this.loading.set(false);
        if (markRead && feed.unread) {
          this.api.markCommentsRead().subscribe(() => this.adminState.unreadComments.set(0));
        }
      },
      error: () => this.loading.set(false),
    });
  }

  startReply(c: CommentFeedItem): void {
    this.draft = '';
    this.replyingTo.set(c.id);
  }

  sendReply(c: CommentFeedItem): void {
    const text = this.draft.trim();
    if (!text) return;
    this.busy.set(true);
    const ctx = { gallery_id: c.gallery?.id ?? null, photo_id: c.photo?.id ?? null };
    // Replies are one level deep: answering a reply joins its parent's thread.
    this.api.postComment(ctx, text, c.parent_id ?? c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.replyingTo.set(null);
        this.showToast('Reply posted');
        this.load();
      },
      error: () => {
        this.busy.set(false);
        this.showToast("Couldn't post that reply");
      },
    });
  }

  remove(c: CommentFeedItem): void {
    const extra = c.parent_id ? '' : ' Replies to it go too.';
    if (!confirm(`Delete this comment by ${c.author.username}?${extra}`)) return;
    this.api.deleteComment(c.id).subscribe({
      next: () => {
        this.showToast('Comment deleted');
        this.load();
      },
      error: () => this.showToast('Delete failed'),
    });
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => {
      if (this.toast() === msg) this.toast.set('');
    }, 2400);
  }
}
