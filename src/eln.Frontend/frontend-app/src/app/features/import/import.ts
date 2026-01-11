import { Component, OnInit, signal } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TemplateSchema, TemplateFieldType } from '../../models/template-schema';
import { ExcelParseService, ExcelParseResponse } from '../../services/excel-parse.service';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { MeasurementService } from '../../services/measurement.service';
import { MeasurementSeriesService } from '../../services/measurement-series.service';
import { firstValueFrom } from 'rxjs';

export interface TemplateCatalogEntry {
  sectionTitle: string;
  fieldKey: string;
  fieldType: TemplateFieldType;
}

export interface BuildMeasurementDataError {
  fieldKey: string;
  reason: string;
}

export interface RowImportError {
  rowIndex: number;
  error: BuildMeasurementDataError | { fieldKey: string; reason: string };
}

export type BuildMeasurementDataResult =
  | { data: Record<string, Record<string, unknown>> }
  | { error: BuildMeasurementDataError };

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildTemplateCatalog = (schema: TemplateSchema): TemplateCatalogEntry[] => {
  const entries: TemplateCatalogEntry[] = [];

  schema.sections?.forEach((section) => {
    const sectionTitle = section.title?.trim() || 'Sektion';
    section.cards?.forEach((card) => {
      const cardTitle = card.title?.trim() || 'Bereich';
      card.fields?.forEach((field) => {
        const fieldLabel = field.label?.trim() || 'Feld';
        const fieldKey = `${cardTitle} - ${fieldLabel}`;
        entries.push({
          sectionTitle,
          fieldKey,
          fieldType: field.type
        });
      });
    });
  });

  return entries;
};

export const autoMapColumns = (
  columns: string[],
  catalog: TemplateCatalogEntry[]
): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const exactIndex = new Map(catalog.map((entry) => [entry.fieldKey, entry]));
  const normalizedFieldKeyIndex = new Map(
    catalog.map((entry) => [normalizeToken(entry.fieldKey), entry])
  );
  const normalizedLabelIndex = new Map<string, TemplateCatalogEntry[]>();
  catalog.forEach((entry) => {
    const label = normalizeToken(entry.fieldKey.split(' - ').slice(-1)[0]);
    const bucket = normalizedLabelIndex.get(label) ?? [];
    bucket.push(entry);
    normalizedLabelIndex.set(label, bucket);
  });

  columns.forEach((column) => {
    const exact = exactIndex.get(column);
    if (exact) {
      mapping[column] = exact.fieldKey;
      return;
    }

    const normalizedColumn = normalizeToken(column);
    const normalizedMatch = normalizedFieldKeyIndex.get(normalizedColumn);
    if (normalizedMatch) {
      mapping[column] = normalizedMatch.fieldKey;
      return;
    }

    const labelMatches = normalizedLabelIndex.get(normalizedColumn);
    if (labelMatches && labelMatches.length === 1) {
      mapping[column] = labelMatches[0].fieldKey;
    }
  });

  return mapping;
};

const sanitizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const normalized = String(value).trim().replace(',', '.');
  if (normalized.length === 0) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildMeasurementData = (
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  templateCatalog: TemplateCatalogEntry[],
  fieldKeyToColumn: Map<string, string>
): BuildMeasurementDataResult => {
  const data: Record<string, Record<string, unknown>> = {};

  for (const entry of templateCatalog) {
    const sourceColumn = fieldKeyToColumn.get(entry.fieldKey);
    if (!sourceColumn) {
      return { error: { fieldKey: entry.fieldKey, reason: 'Missing mapping for template field.' } };
    }

    const rawValue = row[sourceColumn];
    let parsedValue: string | number | null = null;

    if (entry.fieldType === 'number') {
      parsedValue = parseNumber(rawValue);
      if (parsedValue === null) {
        return { error: { fieldKey: entry.fieldKey, reason: 'Invalid or missing number value.' } };
      }
    } else if (entry.fieldType === 'text' || entry.fieldType === 'multiline') {
      parsedValue = sanitizeText(rawValue);
      if (parsedValue === null) {
        return { error: { fieldKey: entry.fieldKey, reason: 'Invalid or missing text value.' } };
      }
    } else {
      return { error: { fieldKey: entry.fieldKey, reason: `Unsupported field type '${entry.fieldType}'.` } };
    }

    if (!data[entry.sectionTitle]) {
      data[entry.sectionTitle] = {};
    }
    data[entry.sectionTitle][entry.fieldKey] = parsedValue;
  }

  return { data };
};

@Component({
  selector: 'app-import',
  imports: [FormsModule, Header, Footer],
  templateUrl: './import.html',
  styleUrl: './import.scss',
})
export class Import implements OnInit {
  private readonly excelParseService: ExcelParseService;
  private readonly templateService: TemplateService;
  private readonly measurementService: MeasurementService;
  private readonly measurementSeriesService: MeasurementSeriesService;

  selectedTemplate = '';
  selectedFile = signal<File | null>(null);
  dragOver = signal(false);
  templates = signal<TemplateDto[]>([]);
  previewRows = signal<Array<Record<string, unknown>>>([]);
  previewColumns = signal<string[]>([]);
  importStatus = signal<'idle' | 'parsing' | 'importing' | 'done' | 'error'>('idle');
  rowErrors = signal<RowImportError[]>([]);
  importedCount = signal(0);
  totalCount = signal(0);
  globalError = signal<string | null>(null);
  headerRow = signal(1);
  createNewSeries = signal(true);

  constructor(
    private router: Router,
    excelParseService: ExcelParseService,
    templateService: TemplateService,
    measurementService: MeasurementService,
    measurementSeriesService: MeasurementSeriesService
  ) {
    this.excelParseService = excelParseService;
    this.templateService = templateService;
    this.measurementService = measurementService;
    this.measurementSeriesService = measurementSeriesService;
  }

  ngOnInit(): void {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    this.templateService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: () => this.templates.set([])
    });
  }

  isDragOver(): boolean {
    return this.dragOver();
  }

  onTemplateChange(): void {
    console.log('Template selected:', this.selectedTemplate);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile.set(files[0]);
    }
  }

  removeFile(): void {
    this.selectedFile.set(null);
  }

  canProceed(): boolean {
    return this.selectedTemplate !== '' && this.selectedFile() !== null;
  }

  onUpload(): void {
    if (!this.canProceed()) {
      return;
    }

    void this.startImport();
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  private resolveTemplate(selected: string): TemplateDto | null {
    const templates = this.templates();
    const byId = Number(selected);
    if (!Number.isNaN(byId)) {
      return templates.find((template) => template.id === byId) ?? null;
    }

    const normalized = selected.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return templates.find((template) => template.name.trim().toLowerCase() === normalized) ?? null;
  }

  private parseSchema(schema: string): TemplateSchema | null {
    try {
      const parsed = JSON.parse(schema);
      return parsed as TemplateSchema;
    } catch {
      return null;
    }
  }

  private async startImport(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    const template = this.resolveTemplate(this.selectedTemplate);
    if (!template) {
      this.importStatus.set('error');
      this.globalError.set('Template konnte nicht geladen werden.');
      return;
    }

    const schema = this.parseSchema(template.schema);
    if (!schema) {
      this.importStatus.set('error');
      this.globalError.set('Template-Schema ist ungültig.');
      return;
    }

    this.importStatus.set('parsing');
    this.rowErrors.set([]);
    this.importedCount.set(0);
    this.totalCount.set(0);
    this.globalError.set(null);

    let parseResponse: ExcelParseResponse;
    try {
      parseResponse = await firstValueFrom(
        this.excelParseService.parseExcel(file, this.headerRow())
      );
    } catch (error) {
      this.importStatus.set('error');
      this.globalError.set('Excel-Datei konnte nicht geparst werden.');
      return;
    }

    this.previewRows.set(parseResponse.preview ?? []);
    this.previewColumns.set(parseResponse.columns ?? []);
    this.totalCount.set(parseResponse.preview?.length ?? 0);

    const catalog = buildTemplateCatalog(schema);
    const mapping = autoMapColumns(parseResponse.columns ?? [], catalog);

    this.importStatus.set('importing');

    let seriesId: number | null = null;
    if (this.createNewSeries()) {
      const rawName = file.name.replace(/\.[^/.]+$/, '');
      const name = rawName.trim().slice(0, 200) || 'Import';
      try {
        const series = await firstValueFrom(
          this.measurementSeriesService.createSeries({
            name,
            description: `Import aus Datei ${file.name}`
          })
        );
        seriesId = series.id;
      } catch {
        this.importStatus.set('error');
        this.globalError.set('Messreihe konnte nicht erstellt werden.');
        return;
      }
    }

    if (!this.createNewSeries() && seriesId === null) {
      this.importStatus.set('error');
      this.globalError.set('Keine Messreihe ausgewählt. Import abgebrochen.');
      return;
    }

    // Hinweis: Aktuell werden bewusst nur die Preview-Zeilen importiert.
    const rows = parseResponse.preview ?? [];
    const fieldKeyToColumn = new Map<string, string>();
    Object.keys(mapping).forEach((column) => {
      fieldKeyToColumn.set(mapping[column], column);
    });
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const result = buildMeasurementData(row, mapping, catalog, fieldKeyToColumn);
      if ('error' in result) {
        this.rowErrors.update((current) => [
          ...current,
          { rowIndex: index + 1, error: result.error }
        ]);
        continue;
      }

      const payload = {
        seriesId: seriesId!,
        templateId: template.id,
        data: result.data
      };

      try {
        await firstValueFrom(this.measurementService.createMeasurement(payload));
        this.importedCount.update((count) => count + 1);
      } catch {
        this.rowErrors.update((current) => [
          ...current,
          {
            rowIndex: index + 1,
            error: { fieldKey: '*', reason: 'Measurement konnte nicht gespeichert werden.' }
          }
        ]);
      }
    }

    this.importStatus.set('done');
  }
}
