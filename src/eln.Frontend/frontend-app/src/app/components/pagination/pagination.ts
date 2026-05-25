import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss'
})
export class Pagination {
  @Input({ required: true }) set page(value: number) {
    this.pageSignal.set(value);
  }
  @Input({ required: true }) set totalPages(value: number) {
    this.totalPagesSignal.set(value);
  }
  @Input() set total(value: number) {
    this.totalSignal.set(value);
  }
  @Input() set pageSize(value: number) {
    this.pageSizeSignal.set(value);
  }
  @Input() pageSizeOptions: number[] = [10, 20, 50, 100];
  @Input() loading = false;
  @Input() label = 'Einträge';
  @Input() showRange = true;
  @Input() showPageSize = true;

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  private readonly pageSignal = signal(1);
  private readonly totalPagesSignal = signal(1);
  private readonly totalSignal = signal(0);
  private readonly pageSizeSignal = signal(10);

  readonly currentPage = computed(() => this.pageSignal());
  readonly currentTotalPages = computed(() => Math.max(1, this.totalPagesSignal()));
  readonly currentTotal = computed(() => this.totalSignal());
  readonly currentPageSize = computed(() => this.pageSizeSignal());

  readonly hasPrev = computed(() => this.currentPage() > 1);
  readonly hasNext = computed(() => this.currentPage() < this.currentTotalPages());

  readonly rangeStart = computed(() =>
    this.currentTotal() === 0 ? 0 : (this.currentPage() - 1) * this.currentPageSize() + 1
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.currentTotal(), this.currentPage() * this.currentPageSize())
  );

  prev(): void {
    if (this.hasPrev() && !this.loading) {
      this.pageChange.emit(this.currentPage() - 1);
    }
  }

  next(): void {
    if (this.hasNext() && !this.loading) {
      this.pageChange.emit(this.currentPage() + 1);
    }
  }

  onPageSizeChange(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      this.pageSizeChange.emit(parsed);
    }
  }
}
