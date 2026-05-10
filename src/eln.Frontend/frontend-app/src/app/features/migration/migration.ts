import { Component, OnInit, computed, signal } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem
} from '@angular/cdk/drag-drop';
import { TemplateSchema, TemplateFieldType, TemplateCardSchema, TemplateFieldSchema, TemplateSectionSchema } from '../../models/template-schema';
import { BackendTemplateSchema } from '../../models/backend-template-schema';
import {
  isBackendSchema,
  isUiSchema,
  mapBackendTypeToUiType,
  mapUiTypeToBackendType,
  splitFieldName
} from '../../utils/template-schema';
import { ExcelParseService, ExcelParseResponse } from '../../services/excel-parse.service';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { MeasurementSeriesService, MeasurementSeriesDto } from '../../services/measurement-series.service';
import { ImportService, ImportResponse } from '../../services/import.service';
import { MappingProfileService, MappingProfile } from '../../services/mapping-profile.service';
import { firstValueFrom } from 'rxjs';

interface TemplateField {
  fullKey: string;
  label: string;
  section: string;
  type: TemplateFieldType;
}

interface ColumnMapping {
  templateField: string;
  templateFieldLabel: string;
  templateFieldSection: string;
  excelColumn: string | null;
  autoMapped: boolean;
}

interface BuilderSection extends TemplateSectionSchema {
  cards: BuilderCard[];
}

interface BuilderCard extends TemplateCardSchema {
  fields: BuilderField[];
}

type BuilderField = TemplateFieldSchema;

type MigrationStep = 'template' | 'upload' | 'mapping' | 'series' | 'importing' | 'result';

@Component({
  selector: 'app-migration',
  imports: [FormsModule, DragDropModule, Header, Footer],
  templateUrl: './migration.html',
  styleUrl: './migration.scss',
})
export class Migration implements OnInit {
  // Step tracking
  currentStep = signal<MigrationStep>('template');

  // Step 1: Template
  templateMode = signal<'existing' | 'new'>('existing');
  selectedTemplate = '';
  templates = signal<TemplateDto[]>([]);

  // Template Builder (inline)
  newTemplateName = '';
  builderSections = signal<BuilderSection[]>([]);
  newSectionTitle = '';
  newCardSectionId = '';
  newCardTitle = '';
  newFieldSectionId = '';
  newFieldCardId = '';
  newFieldLabel = '';
  newFieldType: TemplateFieldType = 'text';
  isCreatingTemplate = signal(false);
  generatorFile = signal<File | null>(null);
  isParsingFile = signal(false);

  readonly fieldTypeOptions: { value: TemplateFieldType; label: string }[] = [
    { value: 'text', label: 'Kurztext' },
    { value: 'number', label: 'Zahl' },
    { value: 'multiline', label: 'Langtext' },
    { value: 'table', label: 'Tabelle' },
    { value: 'media', label: 'Bilder / Medien' },
    { value: 'date', label: 'Datum' },
    { value: 'boolean', label: 'Ja/Nein' }
  ];

  // Step 2: Upload
  selectedFile = signal<File | null>(null);
  dragOver = signal(false);

  // Step 3: Mapping
  excelColumns: string[] = [];
  templateFields: TemplateField[] = [];
  mappings: ColumnMapping[] = [];
  savedProfiles = signal<MappingProfile[]>([]);
  selectedProfileId: string | null = null;
  autoMappedCount = 0;
  saveAsProfile = false;
  newProfileName = '';

  // Step 4: Series
  seriesMode = signal<'new' | 'existing'>('new');
  newSeriesName = '';
  selectedSeriesId = '';
  existingSeries = signal<MeasurementSeriesDto[]>([]);

  // Step 5: Result
  importResult = signal<ImportResponse | null>(null);
  isImporting = signal(false);
  globalError = signal<string | null>(null);

  constructor(
    private router: Router,
    private excelParseService: ExcelParseService,
    private templateService: TemplateService,
    private measurementSeriesService: MeasurementSeriesService,
    private importService: ImportService,
    private mappingProfileService: MappingProfileService
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
    this.loadSeries();
  }

  private loadTemplates(): void {
    this.templateService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates.filter((template) => !template.isArchived)),
      error: () => this.templates.set([])
    });
  }

  private loadSeries(): void {
    this.measurementSeriesService.getSeries().subscribe({
      next: (series) => this.existingSeries.set(series),
      error: () => this.existingSeries.set([])
    });
  }

  // --- Step helpers ---

  getStepNumber(): number {
    const steps: MigrationStep[] = ['template', 'upload', 'mapping', 'series', 'importing', 'result'];
    return steps.indexOf(this.currentStep()) + 1;
  }

  getStepLabel(): string {
    switch (this.currentStep()) {
      case 'template': return 'Template waehlen';
      case 'upload': return 'Datei hochladen';
      case 'mapping': return 'Spalten zuordnen';
      case 'series': return 'Messserie waehlen';
      case 'importing': return 'Import laeuft...';
      case 'result': return 'Ergebnis';
    }
  }

  getProgressWidth(): string {
    return `${(this.getStepNumber() / 6) * 100}%`;
  }

  // --- Template ---

  onTemplateChange(): void {
    this.excelColumns = [];
    this.templateFields = [];
    this.mappings = [];
    this.importResult.set(null);
    this.globalError.set(null);
    this.selectedFile.set(null);
    this.selectedProfileId = null;

    if (this.selectedTemplate) {
      this.loadProfiles();
    }
  }

  private loadProfiles(): void {
    const templateId = Number(this.selectedTemplate);
    if (isNaN(templateId)) return;
    this.mappingProfileService.getByTemplate(templateId).subscribe({
      next: (profiles) => this.savedProfiles.set(profiles),
      error: () => this.savedProfiles.set([])
    });
  }

  goToUpload(): void {
    if (this.templateMode() === 'new') {
      void this.createAndSelectTemplate();
      return;
    }
    if (!this.selectedTemplate) return;
    this.currentStep.set('upload');
  }

  // --- File handling ---

  isDragOver(): boolean {
    return this.dragOver();
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
    this.excelColumns = [];
    this.mappings = [];
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('migrationFileInput') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  // --- Preview & Mapping ---

  onLoadPreview(): void {
    void this.loadPreview();
  }

  private async loadPreview(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;

    const template = this.resolveTemplate(this.selectedTemplate);
    if (!template) {
      this.globalError.set('Template konnte nicht geladen werden.');
      return;
    }

    const schema = this.parseSchema(template.schema);
    if (!schema) {
      this.globalError.set('Template-Schema ist ungueltig.');
      return;
    }

    this.globalError.set(null);

    let parseResponse: ExcelParseResponse;
    try {
      parseResponse = await firstValueFrom(
        this.excelParseService.parseFile(file, 1)
      );
    } catch {
      this.globalError.set('Datei konnte nicht geparst werden.');
      return;
    }

    this.excelColumns = parseResponse.columns ?? [];
    this.templateFields = this.buildTemplateFields(schema);
    this.buildAutoMapping();
    this.currentStep.set('mapping');
  }

  private buildTemplateFields(schema: TemplateSchema): TemplateField[] {
    const fields: TemplateField[] = [];
    schema.sections?.forEach((section) => {
      const sectionTitle = section.title?.trim() || 'Sektion';
      section.cards?.forEach((card) => {
        const cardTitle = card.title?.trim() || 'Bereich';
        card.fields?.forEach((field) => {
          const fieldLabel = field.label?.trim() || 'Feld';
          fields.push({
            fullKey: `${cardTitle} - ${fieldLabel}`,
            label: fieldLabel,
            section: sectionTitle,
            type: field.type
          });
        });
      });
    });
    return fields;
  }

  buildAutoMapping(): void {
    this.mappings = [];
    const usedColumns = new Set<string>();

    for (const field of this.templateFields) {
      let matchedColumn: string | null = null;

      // Strategy 1: Exact match on full key
      let match = this.excelColumns.find(c => c === field.fullKey && !usedColumns.has(c));
      if (match) matchedColumn = match;

      // Strategy 2: Exact match on label
      if (!matchedColumn) {
        match = this.excelColumns.find(c => c === field.label && !usedColumns.has(c));
        if (match) matchedColumn = match;
      }

      // Strategy 3: Case-insensitive, special chars removed
      if (!matchedColumn) {
        const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-()°.,;:\/\\]/g, '').trim();
        const normLabel = normalize(field.label);
        const normKey = normalize(field.fullKey);
        match = this.excelColumns.find(c => {
          const normCol = normalize(c);
          return (normCol === normLabel || normCol === normKey) && !usedColumns.has(c);
        });
        if (match) matchedColumn = match;
      }

      // Strategy 4: Substring match (min 4 chars)
      if (!matchedColumn) {
        const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-()°.,;:\/\\]/g, '').trim();
        const normLabel = normalize(field.label);
        if (normLabel.length >= 4) {
          match = this.excelColumns.find(c => {
            const normCol = normalize(c);
            return normCol.length >= 4
              && (normCol.includes(normLabel) || normLabel.includes(normCol))
              && !usedColumns.has(c);
          });
          if (match) matchedColumn = match;
        }
      }

      if (matchedColumn) usedColumns.add(matchedColumn);

      this.mappings.push({
        templateField: field.fullKey,
        templateFieldLabel: field.label,
        templateFieldSection: field.section,
        excelColumn: matchedColumn,
        autoMapped: matchedColumn !== null
      });
    }

    this.autoMappedCount = this.mappings.filter(m => m.autoMapped).length;
  }

  // --- Profile handling ---

  loadProfile(): void {
    if (!this.selectedProfileId) {
      this.buildAutoMapping();
      return;
    }

    const profile = this.savedProfiles().find(p => String(p.id) === this.selectedProfileId);
    if (!profile) return;

    // Reset to auto-mapping first, then overlay profile
    this.buildAutoMapping();

    for (const m of this.mappings) {
      const entry = Object.entries(profile.mapping).find(([, tf]) => tf === m.templateField);
      if (entry) {
        const [excelCol] = entry;
        if (this.excelColumns.includes(excelCol)) {
          m.excelColumn = excelCol;
          m.autoMapped = false;
        }
      }
    }
  }

  async saveProfile(): Promise<void> {
    const profileName = this.newProfileName.trim();
    if (!profileName || !this.selectedTemplate) return;

    const mapping: Record<string, string> = {};
    for (const m of this.mappings) {
      if (m.excelColumn) {
        mapping[m.excelColumn] = m.templateField;
      }
    }

    await firstValueFrom(this.mappingProfileService.create({
      name: profileName,
      templateId: Number(this.selectedTemplate),
      mapping
    }));

    this.newProfileName = profileName;
    this.loadProfiles();
  }

  deleteProfile(id: number, event: Event): void {
    event.stopPropagation();
    this.mappingProfileService.delete(id).subscribe({
      next: () => {
        this.loadProfiles();
        if (this.selectedProfileId === String(id)) {
          this.selectedProfileId = null;
          this.buildAutoMapping();
        }
      }
    });
  }

  hasAnyMapping(): boolean {
    return this.mappings.some(m => m.excelColumn !== null);
  }

  // --- Series step ---

  goToSeries(): void {
    if (!this.hasAnyMapping()) return;
    this.currentStep.set('series');
  }

  canStartImport(): boolean {
    if (this.seriesMode() === 'existing' && !this.selectedSeriesId) return false;
    return true;
  }

  // --- Import ---

  onImport(): void {
    if (!this.canStartImport()) return;
    void this.startImport();
  }

  private async startImport(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;

    const templateId = Number(this.selectedTemplate);
    if (isNaN(templateId)) {
      this.globalError.set('Ungueltiges Template.');
      return;
    }

    // Build column mapping: {"Excel-Spalte": "Template-Feld"}
    const columnMapping: Record<string, string> = {};
    for (const m of this.mappings) {
      if (m.excelColumn) {
        columnMapping[m.excelColumn] = m.templateField;
      }
    }

    this.currentStep.set('importing');
    this.isImporting.set(true);
    this.globalError.set(null);

    try {
      const ext = file.name.toLowerCase().split('.').pop();
      const seriesId = this.seriesMode() === 'existing' && this.selectedSeriesId
        ? Number(this.selectedSeriesId) : undefined;
      const seriesName = this.seriesMode() === 'new'
        ? (this.newSeriesName.trim() || file.name.replace(/\.[^/.]+$/, ''))
        : undefined;

      let result: ImportResponse;
      if (ext === 'csv') {
        result = await firstValueFrom(
          this.importService.importCsv(file, templateId, seriesId, seriesName, undefined, columnMapping)
        );
      } else {
        result = await firstValueFrom(
          this.importService.importExcel(file, templateId, seriesId, seriesName, undefined, columnMapping)
        );
      }

      this.importResult.set(result);

      if (this.saveAsProfile) {
        if (!this.newProfileName.trim()) {
          this.globalError.set('Import erfolgreich, aber das Mapping-Profil wurde nicht gespeichert: Profilname fehlt.');
        } else {
          try {
            await this.saveProfile();
            this.saveAsProfile = false;
          } catch (error: unknown) {
            this.globalError.set(
              error instanceof Error
                ? `Import erfolgreich, aber das Mapping-Profil konnte nicht gespeichert werden: ${error.message}`
                : 'Import erfolgreich, aber das Mapping-Profil konnte nicht gespeichert werden.'
            );
          }
        }
      }

      this.currentStep.set('result');
    } catch (error: unknown) {
      this.globalError.set(
        error instanceof Error ? error.message : 'Import fehlgeschlagen.'
      );
      this.currentStep.set('mapping');
    } finally {
      this.isImporting.set(false);
    }
  }

  // --- Navigation ---

  startNextFile(): void {
    this.selectedFile.set(null);
    this.importResult.set(null);
    this.excelColumns = [];
    this.mappings = [];
    this.globalError.set(null);
    this.currentStep.set('upload');
  }

  navigateToSeries(): void {
    const result = this.importResult();
    if (result) {
      this.router.navigate(['/messungen/serie', result.seriesId]);
    }
  }

  resetMigration(): void {
    this.selectedFile.set(null);
    this.excelColumns = [];
    this.templateFields = [];
    this.mappings = [];
    this.importResult.set(null);
    this.globalError.set(null);
    this.newSeriesName = '';
    this.selectedSeriesId = '';
    this.selectedTemplate = '';
    this.selectedProfileId = null;
    this.saveAsProfile = false;
    this.newProfileName = '';
    this.templateMode.set('existing');
    this.newTemplateName = '';
    this.builderSections.set([]);
    this.currentStep.set('template');
  }

  // --- Template Builder ---

  addBuilderSection(): void {
    const title = this.newSectionTitle.trim();
    if (!title) return;
    const section: BuilderSection = {
      id: `section-${Math.random().toString(36).slice(2, 9)}`,
      title,
      cards: []
    };
    this.builderSections.update(s => [...s, section]);
    this.newSectionTitle = '';
  }

  removeBuilderSection(sectionId: string): void {
    this.builderSections.update(s => s.filter(sec => sec.id !== sectionId));
  }

  addBuilderCard(): void {
    const title = this.newCardTitle.trim();
    if (!title || !this.newCardSectionId) return;
    const card: BuilderCard = {
      id: `card-${Math.random().toString(36).slice(2, 9)}`,
      title,
      fields: []
    };
    this.builderSections.update(sections =>
      sections.map(s => s.id === this.newCardSectionId
        ? { ...s, cards: [...s.cards, card] }
        : s
      )
    );
    this.newCardTitle = '';
  }

  removeBuilderCard(sectionId: string, cardId: string): void {
    this.builderSections.update(sections =>
      sections.map(s => s.id === sectionId
        ? { ...s, cards: s.cards.filter(c => c.id !== cardId) }
        : s
      )
    );
  }

  addBuilderField(): void {
    const label = this.newFieldLabel.trim();
    if (!label || !this.newFieldSectionId || !this.newFieldCardId) return;
    const field: BuilderField = {
      id: `field-${Math.random().toString(36).slice(2, 9)}`,
      label,
      type: this.newFieldType
    };
    this.builderSections.update(sections =>
      sections.map(s => s.id === this.newFieldSectionId
        ? {
          ...s,
          cards: s.cards.map(c => c.id === this.newFieldCardId
            ? { ...c, fields: [...c.fields, field] }
            : c
          )
        }
        : s
      )
    );
    this.newFieldLabel = '';
  }

  removeBuilderField(sectionId: string, cardId: string, fieldId: string): void {
    this.builderSections.update(sections =>
      sections.map(s => s.id === sectionId
        ? {
          ...s,
          cards: s.cards.map(c => c.id === cardId
            ? { ...c, fields: c.fields.filter(f => f.id !== fieldId) }
            : c
          )
        }
        : s
      )
    );
  }

  updateSectionTitle(sectionId: string, title: string): void {
    this.builderSections.update(sections =>
      sections.map(s => s.id === sectionId ? { ...s, title } : s)
    );
  }

  updateCardTitle(sectionId: string, cardId: string, title: string): void {
    this.builderSections.update(sections =>
      sections.map(s => s.id === sectionId
        ? { ...s, cards: s.cards.map(c => c.id === cardId ? { ...c, title } : c) }
        : s
      )
    );
  }

  updateFieldLabel(sectionId: string, cardId: string, fieldId: string, label: string): void {
    this.builderSections.update(sections =>
      sections.map(s => s.id === sectionId
        ? {
          ...s,
          cards: s.cards.map(c => c.id === cardId
            ? { ...c, fields: c.fields.map(f => f.id === fieldId ? { ...f, label } : f) }
            : c
          )
        }
        : s
      )
    );
  }

  updateFieldType(sectionId: string, cardId: string, fieldId: string, type: TemplateFieldType): void {
    this.builderSections.update(sections =>
      sections.map(s => s.id === sectionId
        ? {
          ...s,
          cards: s.cards.map(c => c.id === cardId
            ? { ...c, fields: c.fields.map(f => f.id === fieldId ? { ...f, type } : f) }
            : c
          )
        }
        : s
      )
    );
  }

  getBuilderCardsForSection(sectionId: string): BuilderCard[] {
    return this.builderSections().find(s => s.id === sectionId)?.cards ?? [];
  }

  builderHasFields(): boolean {
    return this.builderSections().some(s => s.cards.some(c => c.fields.length > 0));
  }

  // --- Drag & Drop ---

  fieldListIds = computed(() =>
    this.builderSections().flatMap(s => s.cards.map(c => `field-list-${c.id}`))
  );

  cardListIds = computed(() =>
    this.builderSections().map(s => `card-list-${s.id}`)
  );

  onFieldDrop(event: CdkDragDrop<BuilderField[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
    this.builderSections.update(sections => [...sections]);
  }

  onCardDrop(event: CdkDragDrop<BuilderCard[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
    this.builderSections.update(sections => [...sections]);
  }

  getFieldTypeLabel(type: TemplateFieldType): string {
    return this.fieldTypeOptions.find(o => o.value === type)?.label ?? type;
  }

  onGeneratorFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.generatorFile.set(input.files[0]);
    }
  }

  onGenerateFromFile(): void {
    void this.generateTemplateFromFile();
  }

  private async generateTemplateFromFile(): Promise<void> {
    const file = this.generatorFile();
    if (!file) return;

    this.isParsingFile.set(true);
    this.globalError.set(null);

    try {
      const response = await firstValueFrom(
        this.excelParseService.parseFile(file, 1)
      );

      const columns = response.columns ?? [];
      const dtypes = response.dtypes ?? {};

      if (columns.length === 0) {
        this.globalError.set('Die Datei enthält keine Spalten.');
        return;
      }

      // Group columns by card title using "Card - Field" pattern
      const cardMap = new Map<string, BuilderField[]>();

      for (const col of columns) {
        const sepIdx = col.indexOf(' - ');
        let cardTitle: string;
        let fieldLabel: string;

        if (sepIdx !== -1) {
          cardTitle = col.slice(0, sepIdx).trim() || 'Allgemein';
          fieldLabel = col.slice(sepIdx + 3).trim() || col;
        } else {
          cardTitle = 'Allgemein';
          fieldLabel = col.trim();
        }

        if (!cardMap.has(cardTitle)) {
          cardMap.set(cardTitle, []);
        }

        cardMap.get(cardTitle)!.push({
          id: `field-${Math.random().toString(36).slice(2, 9)}`,
          label: fieldLabel,
          type: this.inferFieldType(dtypes[col])
        });
      }

      // Build a single section with all cards
      const cards: BuilderCard[] = Array.from(cardMap.entries()).map(([title, fields]) => ({
        id: `card-${Math.random().toString(36).slice(2, 9)}`,
        title,
        fields
      }));

      const section: BuilderSection = {
        id: `section-${Math.random().toString(36).slice(2, 9)}`,
        title: 'Daten',
        cards
      };

      this.builderSections.set([section]);

      // Auto-fill template name from file name if empty
      if (!this.newTemplateName.trim()) {
        this.newTemplateName = file.name.replace(/\.[^/.]+$/, '');
      }
    } catch {
      this.globalError.set('Datei konnte nicht geparst werden.');
    } finally {
      this.isParsingFile.set(false);
    }
  }

  private inferFieldType(dtype: string | undefined): TemplateFieldType {
    if (!dtype) return 'text';
    const d = dtype.toLowerCase();
    if (d.includes('int') || d.includes('float') || d.includes('number')) return 'number';
    if (d.includes('bool')) return 'boolean';
    if (d.includes('date') || d.includes('datetime')) return 'date';
    return 'text';
  }

  removeGeneratorFile(): void {
    this.generatorFile.set(null);
  }

  private buildBackendSchema(): BackendTemplateSchema {
    return {
      sections: this.builderSections().map(section => ({
        Name: section.title,
        Fields: section.cards.flatMap(card =>
          card.fields.map(field => ({
            Name: `${card.title.trim() || 'Allgemein'} - ${field.label.trim() || 'Feld'}`,
            Type: mapUiTypeToBackendType(field.type),
            Required: false,
            Description: field.hint ?? undefined,
            DefaultValue: null,
            UiType: field.type
          }))
        )
      }))
    };
  }

  async createAndSelectTemplate(): Promise<void> {
    const name = this.newTemplateName.trim();
    if (!name || !this.builderHasFields()) return;

    this.isCreatingTemplate.set(true);
    this.globalError.set(null);

    try {
      const schema = this.buildBackendSchema();
      const created = await firstValueFrom(
        this.templateService.createTemplate({ name, schema })
      );
      this.templates.update(list => [created, ...list]);
      this.selectedTemplate = String(created.id);
      this.loadProfiles();

      // Carry over the generator file as import file
      if (this.generatorFile()) {
        this.selectedFile.set(this.generatorFile());
      }
      this.currentStep.set('upload');
    } catch {
      this.globalError.set('Template konnte nicht erstellt werden.');
    } finally {
      this.isCreatingTemplate.set(false);
    }
  }

  onTemplateModeChange(): void {
    this.selectedTemplate = '';
    this.excelColumns = [];
    this.templateFields = [];
    this.mappings = [];
    this.importResult.set(null);
    this.globalError.set(null);
    this.selectedFile.set(null);
    this.selectedProfileId = null;
  }

  // --- Schema helpers (same as Import) ---

  private resolveTemplate(selected: string): TemplateDto | null {
    const templates = this.templates();
    const byId = Number(selected);
    if (!Number.isNaN(byId)) {
      return templates.find((t) => t.id === byId) ?? null;
    }
    return null;
  }

  private parseSchema(schema: string): TemplateSchema | null {
    try {
      const first = JSON.parse(schema);
      const normalizedFirst = this.normalizeSchema(first);
      if (normalizedFirst) return normalizedFirst;
      if (typeof first === 'string') {
        const second = JSON.parse(first);
        return this.normalizeSchema(second);
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeSchema(schema: unknown): TemplateSchema | null {
    if (isUiSchema(schema)) return schema;
    if (isBackendSchema(schema)) return this.convertBackendSchema(schema);
    return null;
  }

  private convertBackendSchema(schema: BackendTemplateSchema): TemplateSchema {
    return {
      sections: schema.sections.map((section) => {
        const cardMap = new Map<string, { title: string; fields: { label: string; type: TemplateFieldType }[] }>();
        const fields = section.fields ?? section.Fields ?? [];
        fields.forEach((field) => {
          const fieldName = field.name ?? field.Name ?? '';
          const fieldType = field.type ?? field.Type ?? 'text';
          const uiType = field.uiType ?? field.UiType;
          const { cardTitle, fieldLabel } = splitFieldName(fieldName);
          if (!cardMap.has(cardTitle)) {
            cardMap.set(cardTitle, { title: cardTitle, fields: [] });
          }
          cardMap.get(cardTitle)!.fields.push({
            label: fieldLabel,
            type: mapBackendTypeToUiType(fieldType, uiType)
          });
        });
        const cards = Array.from(cardMap.values()).map((card) => ({
          id: `card-${Math.random().toString(36).slice(2, 9)}`,
          title: card.title,
          fields: card.fields.map((f) => ({
            id: `field-${Math.random().toString(36).slice(2, 9)}`,
            label: f.label,
            type: f.type
          }))
        }));
        return {
          id: `section-${Math.random().toString(36).slice(2, 9)}`,
          title: section.name ?? section.Name ?? 'Sektion',
          cards
        };
      })
    };
  }
}
