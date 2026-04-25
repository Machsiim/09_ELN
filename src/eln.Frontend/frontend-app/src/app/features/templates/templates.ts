import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { Router } from '@angular/router';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  TemplateCardSchema,
  TemplateFieldSchema,
  TemplateFieldType,
  TemplateSchema,
  TemplateSectionSchema
} from '../../models/template-schema';
import {
  BackendTemplateSchema
} from '../../models/backend-template-schema';
import {
  isBackendSchema,
  isUiSchema,
  mapBackendTypeToUiType,
  mapUiTypeToBackendType,
  splitFieldName
} from '../../utils/template-schema';

interface BuilderSection extends TemplateSectionSchema {
  cards: BuilderCard[];
}

interface BuilderCard extends TemplateCardSchema {
  fields: BuilderField[];
}

type BuilderField = TemplateFieldSchema;
type TemplateArchiveFilter = 'all' | 'active' | 'archived';

@Component({
  selector: 'app-templates',
  imports: [ReactiveFormsModule, Header, Footer],
  templateUrl: './templates.html',
  styleUrl: './templates.scss'
})
export class Templates implements OnInit {
  private readonly templatesPerPage = 5;
  private readonly fb = inject(FormBuilder);
  private readonly templateService = inject(TemplateService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notification = inject(NotificationService);

  readonly templates = signal<TemplateDto[]>([]);
  readonly templateSearchTerm = signal('');
  readonly templateArchiveFilter = signal<TemplateArchiveFilter>('all');
  readonly templatePage = signal(1);
  readonly filteredTemplates = computed(() => {
    const query = this.normalizeSearchText(this.templateSearchTerm());
    const archiveFilter = this.templateArchiveFilter();
    const templates = this.templates().filter((template) => {
      if (archiveFilter === 'active') {
        return !template.isArchived;
      }
      if (archiveFilter === 'archived') {
        return template.isArchived;
      }
      return true;
    });

    if (!query) {
      return templates;
    }

    const terms = query.split(/\s+/).filter(Boolean);
    return templates.filter((template) => {
      const searchText = this.buildTemplateSearchText(template);
      return terms.every((term) => searchText.includes(term));
    });
  });
  readonly totalTemplatePages = computed(() =>
    Math.max(1, Math.ceil(this.filteredTemplates().length / this.templatesPerPage))
  );
  readonly pagedTemplates = computed(() => {
    const page = Math.min(this.templatePage(), this.totalTemplatePages());
    const start = (page - 1) * this.templatesPerPage;
    return this.filteredTemplates().slice(start, start + this.templatesPerPage);
  });
  readonly templatePageStart = computed(() => {
    const total = this.filteredTemplates().length;
    return total === 0 ? 0 : (Math.min(this.templatePage(), this.totalTemplatePages()) - 1) * this.templatesPerPage + 1;
  });
  readonly templatePageEnd = computed(() =>
    Math.min(this.templatePageStart() + this.pagedTemplates().length - 1, this.filteredTemplates().length)
  );
  readonly sections = signal<BuilderSection[]>([]);
  readonly loading = signal(false);
  readonly confirmModalVisible = signal(false);
  readonly confirmModalMode = signal<'delete' | 'archive'>('delete');
  readonly templateForAction = signal<TemplateDto | null>(null);
  readonly editingField = signal<{ sectionId: string; cardId: string; fieldId: string } | null>(null);

  readonly fieldTypeOptions: { value: TemplateFieldType; label: string }[] = [
    { value: 'text', label: 'Kurztext' },
    { value: 'number', label: 'Zahl' },
    { value: 'multiline', label: 'Langtext' },
    { value: 'table', label: 'Tabelle' },
    { value: 'media', label: 'Bilder / Medien' },
    { value: 'date', label: 'Datum' },
    { value: 'boolean', label: 'Ja/Nein' }
  ];

  readonly templateForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]]
  });

  readonly sectionForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]]
  });

  readonly cardForm = this.fb.nonNullable.group({
    sectionId: ['', Validators.required],
    title: ['', [Validators.required, Validators.maxLength(120)]],
    subtitle: ['']
  });

  readonly fieldForm = this.fb.nonNullable.group({
    sectionId: ['', Validators.required],
    cardId: ['', Validators.required],
    label: ['', [Validators.required, Validators.maxLength(120)]],
    type: this.fb.nonNullable.control<TemplateFieldType>('text'),
    required: false,
    hint: ['']
  });

  ngOnInit(): void {
    if (!this.authService.isStaff()) {
      this.router.navigate(['/startseite']);
      return;
    }
    this.fetchTemplates();
  }

  onTemplateSearchChange(value: string): void {
    this.templateSearchTerm.set(value);
    this.templatePage.set(1);
  }

  onTemplateArchiveFilterChange(value: string): void {
    this.templateArchiveFilter.set(this.isTemplateArchiveFilter(value) ? value : 'all');
    this.templatePage.set(1);
  }

  previousTemplatePage(): void {
    this.templatePage.update((page) => Math.max(1, page - 1));
  }

  nextTemplatePage(): void {
    this.templatePage.update((page) => Math.min(this.totalTemplatePages(), page + 1));
  }

  addSection(): void {
    if (this.sectionForm.invalid) {
      this.sectionForm.markAllAsTouched();
      return;
    }

    const section: BuilderSection = {
      id: this.createId('section'),
      title: this.sectionForm.controls.title.value.trim(),
      cards: []
    };

    this.sections.update((current) => [...current, section]);
    this.sectionForm.reset();
  }

  addCard(): void {
    if (this.cardForm.invalid) {
      this.cardForm.markAllAsTouched();
      return;
    }

    const sectionId = this.cardForm.controls.sectionId.value;
    const section = this.findSection(sectionId);
    if (!section) {
      return;
    }

    const card: BuilderCard = {
      id: this.createId('card'),
      title: this.cardForm.controls.title.value.trim(),
      subtitle: this.cardForm.controls.subtitle.value?.trim() ?? '',
      fields: []
    };

    section.cards = [...section.cards, card];
    this.sections.update((current) => current.map((s) => (s.id === section.id ? section : s)));
    this.cardForm.reset({ sectionId: '', title: '', subtitle: '' });
  }

  addField(): void {
    if (this.fieldForm.invalid) {
      this.fieldForm.markAllAsTouched();
      return;
    }

    const section = this.findSection(this.fieldForm.controls.sectionId.value);
    if (!section) {
      return;
    }

    const card = section.cards.find((c) => c.id === this.fieldForm.controls.cardId.value);
    if (!card) {
      return;
    }

    const nextField: BuilderField = {
      id: this.editingField()?.fieldId ?? this.createId('field'),
      label: this.fieldForm.controls.label.value.trim(),
      type: this.fieldForm.controls.type.value,
      required: this.fieldForm.controls.required.value,
      hint: this.fieldForm.controls.hint.value?.trim() ?? ''
    };

    const editingField = this.editingField();
    card.fields = editingField
      ? card.fields.map((field) => (field.id === editingField.fieldId ? nextField : field))
      : [...card.fields, nextField];
    section.cards = section.cards.map((c) => (c.id === card.id ? card : c));
    this.sections.update((current) => current.map((s) => (s.id === section.id ? section : s)));
    this.resetFieldForm();
  }

  removeSection(sectionId: string): void {
    this.sections.update((current) => current.filter((section) => section.id !== sectionId));
  }

  removeCard(sectionId: string, cardId: string): void {
    this.sections.update((current) =>
      current.map((section) =>
        section.id === sectionId
          ? { ...section, cards: section.cards.filter((card) => card.id !== cardId) }
          : section
      )
    );
  }

  removeField(sectionId: string, cardId: string, fieldId: string): void {
    if (this.editingField()?.fieldId === fieldId) {
      this.cancelFieldEdit();
    }

    this.sections.update((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
            ...section,
            cards: section.cards.map((card) =>
              card.id === cardId
                ? { ...card, fields: card.fields.filter((field) => field.id !== fieldId) }
                : card
            )
          }
          : section
      )
    );
  }

  handleFieldSectionChange(): void {
    this.fieldForm.controls.cardId.setValue('');
  }

  startEditField(sectionId: string, cardId: string, fieldId: string): void {
    const section = this.findSection(sectionId);
    const card = section?.cards.find((entry) => entry.id === cardId);
    const field = card?.fields.find((entry) => entry.id === fieldId);
    if (!section || !card || !field) {
      return;
    }

    this.editingField.set({ sectionId, cardId, fieldId });
    this.fieldForm.reset({
      sectionId,
      cardId,
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      hint: field.hint ?? ''
    });
  }

  cancelFieldEdit(): void {
    this.resetFieldForm();
  }

  fetchTemplates(): void {
    this.loading.set(true);

    this.templateService
      .getTemplates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (templates) => {
          this.templates.set(templates);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.notification.showError('Templates konnten nicht geladen werden.');
        }
      });
  }

  deleteTemplate(template: TemplateDto): void {
    this.templateForAction.set(template);
    this.confirmModalMode.set('delete');
    this.confirmModalVisible.set(true);
  }

  archiveTemplate(template: TemplateDto): void {
    this.templateForAction.set(template);
    this.confirmModalMode.set('archive');
    this.confirmModalVisible.set(true);
  }

  confirmAction(): void {
    const template = this.templateForAction();
    if (!template) return;

    const mode = this.confirmModalMode();
    this.loading.set(true);

    if (mode === 'delete') {
      this.templateService
        .deleteTemplate(template.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.templates.update((current) => current.filter((t) => t.id !== template.id));
            this.loading.set(false);
            this.confirmModalVisible.set(false);
            this.templateForAction.set(null);
            this.notification.show('Template wurde gelöscht.');
          },
          error: () => {
            this.loading.set(false);
            this.confirmModalVisible.set(false);
            this.templateForAction.set(null);
            this.notification.showError('Fehler beim Löschen des Templates.');
          }
        });
    } else {
      this.templateService
        .archiveTemplate(template.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (archivedTemplate) => {
            this.templates.update((current) =>
              current.map(t => t.id === template.id ? archivedTemplate : t)
            );
            this.loading.set(false);
            this.confirmModalVisible.set(false);
            this.templateForAction.set(null);
            this.notification.show('Template wurde archiviert.');
          },
          error: () => {
            this.loading.set(false);
            this.confirmModalVisible.set(false);
            this.templateForAction.set(null);
            this.notification.showError('Fehler beim Archivieren des Templates.');
          }
        });
    }
  }

  closeConfirmModal(): void {
    this.confirmModalVisible.set(false);
    this.templateForAction.set(null);
  }

  saveTemplate(): void {
    if (!this.authService.isStaff()) {
      this.notification.showError('Nur Lektoren können Templates erstellen.');
      return;
    }

    if (this.templateForm.invalid) {
      this.templateForm.markAllAsTouched();
      return;
    }

    if (this.sections().length === 0) {
      this.notification.showError('Bitte fügen Sie mindestens eine Sektion mit Inhalten hinzu.');
      return;
    }

    if (!this.builderHasFields()) {
      this.notification.showError('Fügen Sie mindestens ein Feld hinzu.');
      return;
    }

    const schema = this.buildSchema();
    const payload = {
      name: this.templateForm.controls.name.value.trim(),
      schema
    };

    if (!payload.name) {
      this.templateForm.controls.name.setErrors({ required: true });
      return;
    }

    this.loading.set(true);

    this.templateService
      .createTemplate(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (template) => {
          this.templates.update((list) => [template, ...list]);
          this.loading.set(false);
          this.notification.show('Template wurde gespeichert.');
          this.templateForm.reset({ name: '' });
        },
        error: () => {
          this.loading.set(false);
          this.notification.showError('Template konnte nicht gespeichert werden.');
        }
      });
  }

  loadTemplateIntoBuilder(template: TemplateDto): void {
    try {
      const schema = this.decodeSchema(template.schema);
      this.templateForm.controls.name.setValue(`${template.name} (Kopie)`);
      this.setSectionsFromSchema(schema);
      this.resetFieldForm();
      this.notification.show('Template wurde in den Builder geladen.');
    } catch {
      this.notification.showError('Schema konnte nicht geladen werden.');
    }
  }

  resetBuilder(): void {
    this.sections.set([]);
    this.templateForm.reset({ name: '' });
    this.resetFieldForm();
  }

  getCardsForSection(sectionId: string): BuilderCard[] {
    const section = this.sections().find((s) => s.id === sectionId);
    return section ? section.cards : [];
  }

  getFieldTypeLabel(type: TemplateFieldType): string {
    return this.fieldTypeOptions.find((option) => option.value === type)?.label ?? type;
  }

  getUsageCountLabel(template: TemplateDto | null): string {
    const usageCount = template?.usageCount ?? 0;
    return usageCount === 1 ? '1 Messung' : `${usageCount} Messungen`;
  }

  private buildSchema(): BackendTemplateSchema {
    return {
      sections: this.sections().map((section) => ({
        Name: section.title,
        Fields: section.cards.flatMap((card) =>
          card.fields.map((field) => ({
            Name: this.buildFieldName(card.title, field.label),
            Type: mapUiTypeToBackendType(field.type),
            Required: field.required ?? false,
            Description: field.hint,
            DefaultValue: null,
            UiType: field.type
          }))
        )
      }))
    };
  }

  private decodeSchema(schema: string): TemplateSchema {
    const parsed = JSON.parse(schema);
    if (isUiSchema(parsed)) {
      return parsed;
    }
    if (isBackendSchema(parsed)) {
      return this.convertBackendSchema(parsed);
    }
    throw new Error('Ungültiges Schema');
  }

  private convertBackendSchema(schema: BackendTemplateSchema): TemplateSchema {
    return {
      sections: schema.sections.map((section) => {
        const cardMap = new Map<string, BuilderCard>();
        const fields = section.fields ?? section.Fields ?? [];

        fields.forEach((field) => {
          const fieldName = field.name ?? field.Name ?? '';
          const fieldType = field.type ?? field.Type;
          const uiType = field.uiType ?? field.UiType;
          const required = field.required ?? field.Required ?? false;
          const description = field.description ?? field.Description;
          const { cardTitle, fieldLabel } = splitFieldName(fieldName);
          if (!cardMap.has(cardTitle)) {
            cardMap.set(cardTitle, {
              id: this.createId('card'),
              title: cardTitle,
              subtitle: '',
              fields: []
            });
          }

          cardMap.get(cardTitle)!.fields.push({
            id: this.createId('field'),
            label: fieldLabel,
            type: mapBackendTypeToUiType(fieldType, uiType),
            required,
            hint: description ?? ''
          });
        });

        return {
          id: this.createId('section'),
          title: section.name ?? section.Name ?? 'Ohne Titel',
          cards: Array.from(cardMap.values())
        };
      })
    };
  }

  private setSectionsFromSchema(schema: TemplateSchema): void {
    const builderSections: BuilderSection[] =
      schema.sections?.map((section) => ({
        id: section.id ?? this.createId('section'),
        title: section.title ?? 'Ohne Titel',
        cards:
          section.cards?.map((card) => ({
            id: card.id ?? this.createId('card'),
            title: card.title ?? 'Bereich',
            subtitle: card.subtitle ?? '',
            fields:
              card.fields?.map((field) => ({
                id: field.id ?? this.createId('field'),
                label: field.label ?? 'Feld',
                type: field.type ?? 'text',
                required: field.required ?? false,
                hint: field.hint ?? ''
              })) ?? []
          })) ?? []
      })) ?? [];

    this.sections.set(builderSections);
  }

  builderHasFields(): boolean {
    return this.sections().some((section) =>
      section.cards.some((card) => card.fields && card.fields.length > 0)
    );
  }

  private findSection(sectionId: string): BuilderSection | undefined {
    return this.sections().find((section) => section.id === sectionId);
  }

  private buildFieldName(cardTitle: string, fieldLabel: string): string {
    const normalizedCard = cardTitle?.trim() || 'Allgemein';
    const normalizedField = fieldLabel?.trim() || 'Feld';
    return `${normalizedCard} - ${normalizedField}`;
  }

  private buildTemplateSearchText(template: TemplateDto): string {
    const parts = [template.name];

    try {
      const schema = JSON.parse(template.schema) as unknown;
      this.collectSchemaSearchParts(schema, parts);
    } catch {
      parts.push(template.schema);
    }

    return this.normalizeSearchText(parts.join(' '));
  }

  private collectSchemaSearchParts(schema: unknown, parts: string[]): void {
    if (isUiSchema(schema)) {
      schema.sections.forEach((section) => {
        parts.push(section.title);
        section.cards.forEach((card) => {
          parts.push(card.title, card.subtitle ?? '');
          card.fields.forEach((field) => {
            parts.push(field.label, field.hint ?? '');
          });
        });
      });
      return;
    }

    if (isBackendSchema(schema)) {
      schema.sections.forEach((section) => {
        parts.push(section.name ?? '', section.Name ?? '');
        const fields = section.fields ?? section.Fields ?? [];

        fields.forEach((field) => {
          const fieldName = field.name ?? field.Name ?? '';
          const { cardTitle, fieldLabel } = splitFieldName(fieldName);
          parts.push(
            fieldName,
            cardTitle,
            fieldLabel,
            field.description ?? '',
            field.Description ?? ''
          );
        });
      });
    }
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .toLowerCase()
      .trim();
  }

  private isTemplateArchiveFilter(value: string): value is TemplateArchiveFilter {
    return value === 'all' || value === 'active' || value === 'archived';
  }

  private createId(scope: string): string {
    return `${scope}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private resetFieldForm(): void {
    this.editingField.set(null);
    this.fieldForm.reset({
      sectionId: '',
      cardId: '',
      label: '',
      type: 'text',
      required: false,
      hint: ''
    });
  }
}
