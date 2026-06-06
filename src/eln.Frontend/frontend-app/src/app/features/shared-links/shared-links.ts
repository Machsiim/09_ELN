import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import {
  MeasurementSeriesService,
  MyShareLinksParams,
  ShareLinkResponseDto
} from '../../services/measurement-series.service';

@Component({
  selector: 'app-shared-links',
  standalone: true,
  imports: [CommonModule, Header, Footer],
  templateUrl: './shared-links.html',
  styleUrl: './shared-links.scss'
})
export class SharedLinks implements OnInit {
  private readonly seriesService = inject(MeasurementSeriesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly links = signal<ShareLinkResponseDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedLink = signal<ShareLinkResponseDto | null>(null);
  readonly searchText = signal('');
  readonly statusFilter = signal('');
  readonly visibilityFilter = signal('');
  readonly filtersApplied = signal(false);

  ngOnInit(): void {
    this.loadLinks();
  }

  updateSearchText(value: string): void {
    this.searchText.set(value);
  }

  updateStatus(value: string): void {
    this.statusFilter.set(value);
  }

  updateVisibility(value: string): void {
    this.visibilityFilter.set(value);
  }

  search(): void {
    this.filtersApplied.set(this.hasFilters());
    this.loadLinks();
  }

  hasFilters(): boolean {
    return Boolean(
      this.searchText().trim() ||
      this.statusFilter() ||
      this.visibilityFilter()
    );
  }

  private loadLinks(): void {
    this.loading.set(true);
    this.error.set(null);

    const params: MyShareLinksParams = {};
    const searchText = this.searchText().trim();
    if (searchText) params.searchText = searchText;
    if (this.statusFilter()) {
      params.status = this.statusFilter() as MyShareLinksParams['status'];
    }
    if (this.visibilityFilter()) {
      params.visibility = this.visibilityFilter() as MyShareLinksParams['visibility'];
    }

    this.seriesService.getMyShareLinks(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          this.links.set(links);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err?.error?.error || 'Geteilte Links konnten nicht geladen werden.'
          );
        }
      });
  }

  getLinkUrl(link: ShareLinkResponseDto): string {
    if (link.shareUrl.startsWith('http://') || link.shareUrl.startsWith('https://')) {
      return link.shareUrl;
    }
    return `${window.location.origin}${link.shareUrl.startsWith('/') ? '' : '/'}${link.shareUrl}`;
  }

  getStatus(link: ShareLinkResponseDto): 'active' | 'expired' | 'inactive' {
    if (!link.isActive) return 'inactive';
    return new Date(link.expiresAt).getTime() <= Date.now() ? 'expired' : 'active';
  }

  openDetails(link: ShareLinkResponseDto): void {
    this.selectedLink.set(link);
  }

  closeDetails(): void {
    this.selectedLink.set(null);
  }
}
