import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { SeriesCharts } from '../../components/series-charts/series-charts';
import {
  MeasurementSeriesTable,
  SeriesTableMeasurement
} from '../../components/measurement-series-table/measurement-series-table';
import {
  MeasurementResponseDto,
  MeasurementService
} from '../../services/measurement.service';
import {
  CreateShareLinkPayload,
  MeasurementSeriesService,
  MeasurementSeriesDto,
  ShareLinkResponseDto
} from '../../services/measurement-series.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { MediaAttachment } from '../../models/media-attachment';

interface HeaderField {
  column: string;
  fieldLabel: string;
}

interface HeaderCard {
  cardTitle: string;
  fields: HeaderField[];
}

interface HeaderSection {
  sectionTitle: string;
  cards: HeaderCard[];
  totalFields: number;
  colorIndex: number;
}

interface HeaderTemplate {
  templateName: string;
  sections: HeaderSection[];
  totalFields: number;
  templateIndex: number;
}

interface TemplateGroup {
  templateId: number;
  templateName: string;
  templateIndex: number;
  sections: HeaderSection[];
  totalFields: number;
  measurements: MeasurementResponseDto[];
}

interface ColumnPickerField {
  column: string;
  label: string;
  visible: boolean;
}

interface ColumnPickerCard {
  cardTitle: string;
  fields: ColumnPickerField[];
  visibleCount: number;
}

interface ColumnPickerSection {
  sectionTitle: string;
  cards: ColumnPickerCard[];
  colorIndex: number;
  fieldCount: number;
  visibleCount: number;
}

interface ColumnPickerTemplate {
  templateId: number;
  templateName: string;
  templateIndex: number;
  sections: ColumnPickerSection[];
  fieldCount: number;
  visibleCount: number;
}

@Component({
  selector: 'app-measurement-series-detail',
  imports: [CommonModule, Header, Footer, SeriesCharts, MeasurementSeriesTable],
  templateUrl: './measurement-series-detail.html',
  styleUrl: './measurement-series-detail.scss'
})
export class MeasurementSeriesDetail implements OnInit {
  private readonly measurementService = inject(MeasurementService);
  private readonly seriesService = inject(MeasurementSeriesService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notification = inject(NotificationService);

  readonly measurements = signal<MeasurementResponseDto[]>([]);
  readonly filteredMeasurements = signal<MeasurementResponseDto[]>([]);
  readonly hasLoadedMeasurements = signal(false);
  readonly searchQuery = signal<string>('');
  readonly activeSearchQuery = signal<string>('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly seriesId = signal<number | null>(null);
  readonly seriesName = signal<string>('');
  readonly seriesDescription = signal<string>('');
  readonly seriesCreatedByUsername = signal<string | null>(null);
  readonly selectedMeasurementIds = signal<Set<number>>(new Set());
  readonly deleteInProgress = signal(false);
  readonly confirmVisible = signal(false);
  readonly confirmMessage = signal<string>('');
  readonly pendingDeletionIds = signal<number[]>([]);
  readonly columnPickerVisible = signal(false);
  readonly columnPickerSearch = signal<string>('');
  readonly visibleColumns = signal<Set<string>>(new Set());
  readonly shareDialogVisible = signal(false);
  readonly shareLink = signal<string | null>(null);
  readonly shareLoading = signal(false);
  readonly shareError = signal<string | null>(null);
  readonly shareExpiresInDays = signal(7);
  readonly shareIsPublic = signal(true);
  readonly shareAllowedEmails = signal<string>('');
  readonly shareExpiresAt = signal<string | null>(null);
  readonly shareCreatedBy = signal<string | null>(null);
  readonly shareAllowedEmailsNormalized = signal<string[]>([]);

  // Lock-related signals
  readonly isLocked = signal(false);
  readonly lockedByUsername = signal<string | null>(null);
  readonly lockInProgress = signal(false);
  readonly isStaff = this.authService.isStaff();

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const id = Number(params['id']);
        if (!Number.isNaN(id)) {
          this.seriesId.set(id);
          this.fetchSeriesInfo(id);
          this.fetchMeasurements(id);
        } else {
          this.error.set('Ungültige Serien-ID');
        }
      });
  }

  private fetchSeriesInfo(id: number): void {
    this.seriesService.getSeriesById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (series) => {
          this.seriesName.set(series.name);
          this.seriesDescription.set(series.description ?? '');
          this.isLocked.set(series.isLocked);
          this.lockedByUsername.set(series.lockedByUsername ?? null);
          this.seriesCreatedByUsername.set(series.createdByUsername);
        },
        error: (err) => {
          console.error('Failed to load series info:', err);
        }
      });
  }

  async toggleLock(): Promise<void> {
    const id = this.seriesId();
    if (!id || this.lockInProgress()) return;

    this.lockInProgress.set(true);

    try {
      if (this.isLocked()) {
        const result = await firstValueFrom(this.seriesService.unlockSeries(id));
        this.isLocked.set(result.isLocked);
        this.lockedByUsername.set(result.lockedByUsername ?? null);
        this.notification.show('Messserie entsperrt.');
      } else {
        const result = await firstValueFrom(this.seriesService.lockSeries(id));
        this.isLocked.set(result.isLocked);
        this.lockedByUsername.set(result.lockedByUsername ?? null);
        this.notification.show('Messserie gesperrt.');
      }
    } catch (err) {
      console.error('Failed to toggle lock:', err);
      this.error.set('Sperrstatus konnte nicht geändert werden.');
    } finally {
      this.lockInProgress.set(false);
    }
  }

  isSelected(measurementId: number): boolean {
    return this.selectedMeasurementIds().has(measurementId);
  }

  hasSelection(): boolean {
    return this.selectedMeasurementIds().size > 0;
  }

  toggleSelection(measurementId: number, checked: boolean): void {
    const current = new Set(this.selectedMeasurementIds());
    if (checked) {
      current.add(measurementId);
    } else {
      current.delete(measurementId);
    }
    this.selectedMeasurementIds.set(current);
  }

  goToMeasurement(measurement: MeasurementResponseDto): void {
    this.router.navigate([`/messungen/serie/${measurement.seriesId}/${measurement.id}`]);
  }

  openTableMeasurement(measurement: SeriesTableMeasurement): void {
    const match = this.filteredMeasurements().find((item) => item.id === measurement.id);
    if (match) {
      this.goToMeasurement(match);
    }
  }

  updateTableSelection(event: { id: number; selected: boolean }): void {
    this.toggleSelection(event.id, event.selected);
  }


  requestDeletion(): void {
    if (!this.hasSelection() || this.deleteInProgress()) {
      return;
    }

    const ids = Array.from(this.selectedMeasurementIds());
    const confirmationMessage =
      ids.length === 1
        ? `Sind Sie sicher, dass Sie die Messung #${ids[0]} löschen wollen?`
        : `Sind Sie sicher, dass Sie die Messungen ${ids.map(id => `#${id}`).join(', ')} löschen wollen?`;

    this.pendingDeletionIds.set(ids);
    this.confirmMessage.set(`${confirmationMessage} Diese Aktion kann nicht widerrufen werden.`);
    this.confirmVisible.set(true);
  }

  cancelDeletion(): void {
    if (this.deleteInProgress()) return;
    this.confirmVisible.set(false);
    this.pendingDeletionIds.set([]);
  }

  async confirmDeletion(): Promise<void> {
    if (this.deleteInProgress() || this.pendingDeletionIds().length === 0) {
      return;
    }

    const ids = this.pendingDeletionIds();
    this.deleteInProgress.set(true);
    this.error.set(null);

    try {
      await Promise.all(
        ids.map(id => firstValueFrom(this.measurementService.deleteMeasurement(id)))
      );

      const remaining = this.measurements().filter(m => !ids.includes(m.id));
      this.measurements.set(remaining);
      this.hasLoadedMeasurements.set(remaining.length > 0);
      this.selectedMeasurementIds.set(new Set());

      if (this.activeSearchQuery().trim()) {
        const seriesId = this.seriesId();
        if (seriesId) {
          this.fetchMeasurements(seriesId, this.activeSearchQuery());
        }
      } else {
        this.filteredMeasurements.set(remaining);
      }
      this.confirmVisible.set(false);
      this.pendingDeletionIds.set([]);
      this.notification.show(ids.length === 1
        ? `Messung #${ids[0]} wurde gelöscht.`
        : `${ids.length} Messungen wurden gelöscht.`);
    } catch (err) {
      console.error('Failed to delete measurements', err);
      this.error.set('Ausgewählte Messungen konnten nicht gelöscht werden.');
    } finally {
      this.deleteInProgress.set(false);
    }
  }

  trackById(_: number, item: MeasurementResponseDto): number {
    return item.id;
  }

  goBack(): void {
    this.router.navigate(['/messungen']);
  }

  canShareSeries(): boolean {
    if (this.isStaff) {
      return true;
    }

    const currentUsername = this.authService.currentUser()?.username?.toLowerCase();
    const createdByUsername = this.seriesCreatedByUsername()?.toLowerCase();
    return !!currentUsername && !!createdByUsername && currentUsername === createdByUsername;
  }

  openShareDialog(): void {
    if (!this.canShareSeries()) {
      return;
    }

    this.shareDialogVisible.set(true);
    this.shareError.set(null);
    this.shareLink.set(null);
    this.shareExpiresAt.set(null);
    this.shareCreatedBy.set(null);
    this.shareAllowedEmails.set('');
    this.shareAllowedEmailsNormalized.set([]);
    this.shareIsPublic.set(true);
  }

  closeShareDialog(): void {
    this.shareDialogVisible.set(false);
    this.shareLink.set(null);
    this.shareLoading.set(false);
    this.shareError.set(null);
    this.shareExpiresAt.set(null);
    this.shareCreatedBy.set(null);
    this.shareAllowedEmails.set('');
    this.shareAllowedEmailsNormalized.set([]);
    this.shareIsPublic.set(true);
  }

  generateShareLink(): void {
    const seriesId = this.seriesId();
    if (!seriesId) {
      this.shareError.set('Serien-ID fehlt.');
      return;
    }

    const allowedUserEmails = this.shareIsPublic() ? [] : this.parseAllowedEmails();
    if (!this.shareIsPublic() && allowedUserEmails.length === 0) {
      this.shareError.set('Bitte mindestens eine Person oder E-Mail-Adresse eintragen.');
      return;
    }

    const payload: CreateShareLinkPayload = {
      expiresInDays: this.shareExpiresInDays(),
      isPublic: this.shareIsPublic(),
      allowedUserEmails
    };

    this.shareLoading.set(true);
    this.shareError.set(null);
    this.seriesService
      .createShareLink(seriesId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.shareLink.set(this.buildShareUrl(response));
          this.shareExpiresAt.set(response.expiresAt);
          this.shareCreatedBy.set(response.createdByUsername);
          this.shareLoading.set(false);
        },
        error: (err) => {
          this.shareLoading.set(false);
          this.shareError.set(err.error?.error || 'Quick-Link konnte nicht erstellt werden.');
        }
      });
  }

  copyShareLink(): void {
    const link = this.shareLink();
    if (!link || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(link);
  }

  updateShareExpiry(rawValue: string): void {
    const parsed = Number(rawValue);
    if (!Number.isNaN(parsed)) {
      this.shareExpiresInDays.set(parsed);
    }
  }

  updateShareVisibility(rawValue: string): void {
    this.shareIsPublic.set(rawValue === 'public');
    this.shareError.set(null);
  }

  updateAllowedEmails(value: string): void {
    this.shareAllowedEmails.set(value);
    this.shareAllowedEmailsNormalized.set(this.parseAllowedEmails());
  }

  private parseAllowedEmails(): string[] {
    const seen = new Set<string>();
    return this.shareAllowedEmails()
      .split(/[,\n;]/)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
      .map((value) => value.includes('@') ? value : `${value}@technikum-wien.at`)
      .filter((email) => {
        if (seen.has(email)) {
          return false;
        }
        seen.add(email);
        return true;
      });
  }

  private buildShareUrl(response: ShareLinkResponseDto): string {
    if (!response.shareUrl) {
      return '';
    }
    if (response.shareUrl.startsWith('http://') || response.shareUrl.startsWith('https://')) {
      return response.shareUrl;
    }
    return `${window.location.origin}${response.shareUrl.startsWith('/') ? '' : '/'}${response.shareUrl}`;
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  submitSearch(): void {
    const seriesId = this.seriesId();
    if (seriesId) {
      const query = this.searchQuery().trim();
      this.activeSearchQuery.set(query);
      this.fetchMeasurements(seriesId, query);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.activeSearchQuery.set('');
    const seriesId = this.seriesId();
    if (seriesId) {
      this.fetchMeasurements(seriesId);
    }
  }

  getBaseColumns(): string[] {
    return ['Mess-ID', 'Erstellt von', 'Erstellt am'];
  }

  getDataColumns(): string[] {
    // Use all measurements to get all possible data columns, not just filtered ones
    const measurements = this.measurements();
    if (measurements.length === 0) return [];

    const columnsSet = new Set<string>();

    measurements.forEach(measurement => {
      Object.keys(measurement.data).forEach(sectionName => {
        const section = measurement.data[sectionName];
        Object.keys(section).forEach(fieldName => {
          columnsSet.add(`${sectionName} - ${fieldName}`);
        });
      });
    });

    return Array.from(columnsSet).sort();
  }

  getAllColumns(): string[] {
    return [...this.getBaseColumns(), ...this.getDataColumns()];
  }

  getVisibleColumns(): string[] {
    const visible = this.visibleColumns();
    return this.getAllColumns().filter(col => visible.has(col));
  }

  getVisibleDataColumns(): string[] {
    const visible = this.visibleColumns();
    return this.getDataColumns().filter(col => visible.has(col));
  }

  toggleColumnVisibility(column: string): void {
    const current = new Set(this.visibleColumns());
    if (current.has(column)) {
      current.delete(column);
    } else {
      current.add(column);
    }
    this.visibleColumns.set(current);
  }

  isColumnVisible(column: string): boolean {
    return this.visibleColumns().has(column);
  }

  isBaseColumnVisible(columnName: string): boolean {
    return this.visibleColumns().has(columnName);
  }

  toggleColumnPicker(): void {
    this.columnPickerVisible.set(!this.columnPickerVisible());
  }

  showAllColumns(): void {
    const allColumns = this.getAllColumns();
    this.visibleColumns.set(new Set(allColumns));
  }

  hideAllColumns(): void {
    this.visibleColumns.set(new Set());
  }

  onColumnPickerSearchChange(value: string): void {
    this.columnPickerSearch.set(value);
  }

  clearColumnPickerSearch(): void {
    this.columnPickerSearch.set('');
  }

  toggleBaseColumn(name: string): void {
    this.toggleColumnVisibility(name);
  }

  isAllVisibleInList(columns: string[]): boolean {
    if (columns.length === 0) return false;
    const visible = this.visibleColumns();
    return columns.every((col) => visible.has(col));
  }

  toggleColumnList(columns: string[]): void {
    if (columns.length === 0) return;
    const current = new Set(this.visibleColumns());
    const allOn = columns.every((col) => current.has(col));
    if (allOn) {
      columns.forEach((col) => current.delete(col));
    } else {
      columns.forEach((col) => current.add(col));
    }
    this.visibleColumns.set(current);
  }

  getColumnPickerTemplates(): ColumnPickerTemplate[] {
    const measurements = this.measurements();
    if (measurements.length === 0) return [];

    const visible = this.visibleColumns();
    const query = this.columnPickerSearch().toLowerCase().trim();

    const templateMap = new Map<number, {
      templateName: string;
      sectionMap: Map<string, Map<string, ColumnPickerField[]>>;
    }>();

    for (const m of measurements) {
      const tplId = m.templateId ?? -1;
      let entry = templateMap.get(tplId);
      if (!entry) {
        entry = {
          templateName: m.templateName || 'Unbekannt',
          sectionMap: new Map()
        };
        templateMap.set(tplId, entry);
      }

      for (const sectionName of Object.keys(m.data)) {
        if (!entry.sectionMap.has(sectionName)) {
          entry.sectionMap.set(sectionName, new Map());
        }
        const cardMap = entry.sectionMap.get(sectionName)!;
        const section = m.data[sectionName];

        for (const fieldKey of Object.keys(section)) {
          const fullColumn = `${sectionName} - ${fieldKey}`;
          const dashIdx = fieldKey.indexOf(' - ');
          const cardTitle = dashIdx > -1 ? fieldKey.slice(0, dashIdx) : fieldKey;
          const fieldLabel = dashIdx > -1 ? fieldKey.slice(dashIdx + 3) : fieldKey;

          if (!cardMap.has(cardTitle)) {
            cardMap.set(cardTitle, []);
          }
          const fields = cardMap.get(cardTitle)!;
          if (!fields.some((f) => f.column === fullColumn)) {
            fields.push({ column: fullColumn, label: fieldLabel, visible: visible.has(fullColumn) });
          }
        }
      }
    }

    const TEMPLATE_COLOR_COUNT = 4;
    let templateIndex = 0;
    const templates: ColumnPickerTemplate[] = [];

    for (const [templateId, entry] of templateMap) {
      const sections: ColumnPickerSection[] = [];
      let templateFieldCount = 0;
      let templateVisibleCount = 0;

      for (const [sectionTitle, cardMap] of entry.sectionMap) {
        const cards: ColumnPickerCard[] = [];
        let sectionFieldCount = 0;
        let sectionVisibleCount = 0;

        for (const [cardTitle, fields] of cardMap) {
          const matchedFields = query
            ? fields.filter(
                (f) =>
                  f.label.toLowerCase().includes(query) ||
                  cardTitle.toLowerCase().includes(query) ||
                  sectionTitle.toLowerCase().includes(query)
              )
            : fields;

          if (matchedFields.length === 0) continue;

          const cardVisible = matchedFields.filter((f) => f.visible).length;
          cards.push({ cardTitle, fields: matchedFields, visibleCount: cardVisible });
          sectionFieldCount += matchedFields.length;
          sectionVisibleCount += cardVisible;
        }

        if (cards.length === 0) continue;

        sections.push({
          sectionTitle,
          cards,
          colorIndex: this.getSectionColorIndex(sectionTitle, templateId),
          fieldCount: sectionFieldCount,
          visibleCount: sectionVisibleCount
        });
        templateFieldCount += sectionFieldCount;
        templateVisibleCount += sectionVisibleCount;
      }

      if (sections.length === 0) {
        templateIndex++;
        continue;
      }

      templates.push({
        templateId,
        templateName: entry.templateName,
        templateIndex: templateIndex % TEMPLATE_COLOR_COUNT,
        sections,
        fieldCount: templateFieldCount,
        visibleCount: templateVisibleCount
      });
      templateIndex++;
    }

    return templates;
  }

  hasMultipleTemplatesInPicker(): boolean {
    return this.getColumnPickerTemplates().length > 1;
  }

  getBaseColumnsList(): string[] {
    return this.getBaseColumns();
  }

  baseColumnsMatchSearch(): boolean {
    const query = this.columnPickerSearch().toLowerCase().trim();
    if (!query) return true;
    return this.getBaseColumns().some((col) => col.toLowerCase().includes(query));
  }

  filteredBaseColumns(): string[] {
    const query = this.columnPickerSearch().toLowerCase().trim();
    const cols = this.getBaseColumns();
    if (!query) return cols;
    return cols.filter((col) => col.toLowerCase().includes(query));
  }

  cardColumnNames(card: ColumnPickerCard): string[] {
    return card.fields.map((f) => f.column);
  }

  private static readonly SECTION_COLOR_COUNT = 10;

  private sectionColorCache = new Map<string, number>();
  private sectionColorCacheKey: string | null = null;

  private sectionColorKey(templateId: number | null, sectionTitle: string): string {
    return `${templateId ?? -1}::${sectionTitle}`;
  }

  private getSectionColorMap(): Map<string, number> {
    const measurements = this.measurements();
    const fingerprint = measurements
      .map((m) => `${m.templateId ?? -1}:${Object.keys(m.data).join('|')}`)
      .join('||');

    if (this.sectionColorCacheKey === fingerprint) {
      return this.sectionColorCache;
    }

    const total = MeasurementSeriesDetail.SECTION_COLOR_COUNT;
    const map = new Map<string, number>();

    for (const m of measurements) {
      const tplId = m.templateId ?? null;
      for (const sectionName of Object.keys(m.data)) {
        const key = this.sectionColorKey(tplId, sectionName);
        if (!map.has(key)) {
          map.set(key, map.size % total);
        }
      }
    }

    this.sectionColorCache = map;
    this.sectionColorCacheKey = fingerprint;
    return map;
  }

  private getSectionColorIndex(sectionTitle: string, templateId: number | null = null): number {
    return this.getSectionColorMap().get(this.sectionColorKey(templateId, sectionTitle)) ?? 0;
  }

  sectionColumnNames(section: ColumnPickerSection): string[] {
    const result: string[] = [];
    for (const card of section.cards) {
      for (const field of card.fields) {
        result.push(field.column);
      }
    }
    return result;
  }

  private resolveColumnValue(measurement: MeasurementResponseDto, column: string): unknown {
    const separatorIndex = column.indexOf(' - ');
    const sectionName = separatorIndex > -1 ? column.slice(0, separatorIndex) : column;
    const fieldKey = separatorIndex > -1 ? column.slice(separatorIndex + 3) : '';

    if (!sectionName || !fieldKey) {
      return null;
    }

    const section = measurement.data[sectionName];
    if (!section) {
      return null;
    }

    return section[fieldKey];
  }

  private extractMediaAttachments(value: unknown): MediaAttachment[] | null {
    const normalized = this.parsePossibleJson(value);
    if (!Array.isArray(normalized)) {
      return null;
    }
    const attachments = normalized.filter(
      (item: unknown): item is MediaAttachment =>
        !!item &&
        typeof item === 'object' &&
        'dataUrl' in item &&
        typeof (item as MediaAttachment).dataUrl === 'string'
    );
    return attachments.length > 0 ? attachments : null;
  }

  getValueForColumn(measurement: MeasurementResponseDto, column: string): string {
    const value = this.resolveColumnValue(measurement, column);
    const normalized = this.parsePossibleJson(value);
    if (normalized === null || normalized === undefined) {
      return '-';
    }

    const attachments = this.extractMediaAttachments(normalized);
    if (attachments) {
      return attachments.map((item) => item.name).join(', ');
    }

    if (typeof normalized === 'object') {
      try {
        return JSON.stringify(normalized);
      } catch {
        return String(normalized);
      }
    }
    return String(normalized);
  }

  private parsePossibleJson(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  getTemplateHeaders(): HeaderTemplate[] {
    const measurements = this.measurements();
    if (measurements.length === 0) return [];

    const visible = this.visibleColumns();

    // Group columns by templateName → preserve which sections belong to which template
    const templateMap = new Map<string, Map<string, Map<string, HeaderField[]>>>();

    for (const m of measurements) {
      const tplName = m.templateName || 'Unbekannt';
      if (!templateMap.has(tplName)) {
        templateMap.set(tplName, new Map());
      }
      const sectionMap = templateMap.get(tplName)!;

      for (const sectionName of Object.keys(m.data)) {
        if (!sectionMap.has(sectionName)) {
          sectionMap.set(sectionName, new Map());
        }
        const cardMap = sectionMap.get(sectionName)!;
        const section = m.data[sectionName];

        for (const fieldKey of Object.keys(section)) {
          const fullColumn = `${sectionName} - ${fieldKey}`;
          if (!visible.has(fullColumn)) continue;

          const dashIdx = fieldKey.indexOf(' - ');
          const cardTitle = dashIdx > -1 ? fieldKey.slice(0, dashIdx) : fieldKey;
          const fieldLabel = dashIdx > -1 ? fieldKey.slice(dashIdx + 3) : fieldKey;

          if (!cardMap.has(cardTitle)) {
            cardMap.set(cardTitle, []);
          }
          const fields = cardMap.get(cardTitle)!;
          if (!fields.some(f => f.column === fullColumn)) {
            fields.push({ column: fullColumn, fieldLabel });
          }
        }
      }
    }

    const TEMPLATE_COLOR_COUNT = 4;
    let templateIndex = 0;
    const templates: HeaderTemplate[] = [];

    for (const [templateName, sectionMap] of templateMap) {
      const sections: HeaderSection[] = [];
      let templateTotalFields = 0;

      for (const [sectionTitle, cardMap] of sectionMap) {
        const cards: HeaderCard[] = [];
        let sectionTotalFields = 0;
        for (const [cardTitle, fields] of cardMap) {
          cards.push({ cardTitle, fields });
          sectionTotalFields += fields.length;
        }
        sections.push({ sectionTitle, cards, totalFields: sectionTotalFields, colorIndex: this.getSectionColorIndex(sectionTitle) });
        templateTotalFields += sectionTotalFields;
      }

      templates.push({ templateName, sections, totalFields: templateTotalFields, templateIndex: templateIndex % TEMPLATE_COLOR_COUNT });
      templateIndex++;
    }

    return templates;
  }

  hasMultipleTemplates(): boolean {
    return this.getTemplateGroups().length > 1;
  }

  getHeaderStructure(): HeaderSection[] {
    return this.getTemplateHeaders().flatMap(t => t.sections);
  }

  getTemplateGroups(): TemplateGroup[] {
    const filtered = this.filteredMeasurements();
    if (filtered.length === 0) return [];

    const visible = this.visibleColumns();
    const groupMap = new Map<number, {
      templateName: string;
      measurements: MeasurementResponseDto[];
      sectionMap: Map<string, Map<string, HeaderField[]>>;
    }>();

    for (const m of filtered) {
      const tplId = m.templateId ?? -1;
      let group = groupMap.get(tplId);
      if (!group) {
        group = {
          templateName: m.templateName || 'Unbekannt',
          measurements: [],
          sectionMap: new Map()
        };
        groupMap.set(tplId, group);
      }
      group.measurements.push(m);

      for (const sectionName of Object.keys(m.data)) {
        if (!group.sectionMap.has(sectionName)) {
          group.sectionMap.set(sectionName, new Map());
        }
        const cardMap = group.sectionMap.get(sectionName)!;
        const section = m.data[sectionName];

        for (const fieldKey of Object.keys(section)) {
          const fullColumn = `${sectionName} - ${fieldKey}`;
          if (!visible.has(fullColumn)) continue;

          const dashIdx = fieldKey.indexOf(' - ');
          const cardTitle = dashIdx > -1 ? fieldKey.slice(0, dashIdx) : fieldKey;
          const fieldLabel = dashIdx > -1 ? fieldKey.slice(dashIdx + 3) : fieldKey;

          if (!cardMap.has(cardTitle)) {
            cardMap.set(cardTitle, []);
          }
          const fields = cardMap.get(cardTitle)!;
          if (!fields.some(f => f.column === fullColumn)) {
            fields.push({ column: fullColumn, fieldLabel });
          }
        }
      }
    }

    const TEMPLATE_COLOR_COUNT = 4;
    let templateIndex = 0;
    const groups: TemplateGroup[] = [];

    for (const [templateId, group] of groupMap) {
      const sections: HeaderSection[] = [];
      let totalFields = 0;

      for (const [sectionTitle, cardMap] of group.sectionMap) {
        const cards: HeaderCard[] = [];
        let sectionTotalFields = 0;
        for (const [cardTitle, fields] of cardMap) {
          if (fields.length === 0) continue;
          cards.push({ cardTitle, fields });
          sectionTotalFields += fields.length;
        }
        if (sectionTotalFields === 0) continue;
        sections.push({
          sectionTitle,
          cards,
          totalFields: sectionTotalFields,
          colorIndex: this.getSectionColorIndex(sectionTitle, templateId)
        });
        totalFields += sectionTotalFields;
      }

      groups.push({
        templateId,
        templateName: group.templateName,
        templateIndex: templateIndex % TEMPLATE_COLOR_COUNT,
        sections,
        totalFields,
        measurements: group.measurements
      });
      templateIndex++;
    }

    return groups;
  }

  getBaseColumnCount(): number {
    let count = 1; // checkbox column
    if (this.isBaseColumnVisible('Mess-ID')) count++;
    if (this.isBaseColumnVisible('Erstellt von')) count++;
    if (this.isBaseColumnVisible('Erstellt am')) count++;
    return count;
  }

  private fetchMeasurements(seriesId: number, searchText = ''): void {
    this.loading.set(true);
    this.error.set(null);

    this.measurementService
      .getMeasurementsBySeriesId(seriesId, searchText)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (measurements) => {
          if (measurements.length > 0) {
            this.seriesName.set(measurements[0].seriesName);
            this.hasLoadedMeasurements.set(true);
          }

          this.measurements.set(measurements);
          this.filteredMeasurements.set(measurements);
          this.selectedMeasurementIds.set(new Set());

          if (this.visibleColumns().size === 0) {
            this.showAllColumns();
          }

          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messungen konnten nicht geladen werden.');
        }
      });
  }

}
