import {
  Component,
  DestroyRef,
  OnInit,
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

@Component({
  selector: 'app-templates',
  imports: [ReactiveFormsModule, Header, Footer],
  templateUrl: './templates.html',
  styleUrl: './templates.scss'
})
export class Templates implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly templateService = inject(TemplateService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly templates = signal<TemplateDto[]>([]);
  readonly sections = signal<BuilderSection[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);
  private toastTimeout: number | null = null;

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
    hint: ['']
  });

  ngOnInit(): void {
    if (!this.authService.isStaff()) {
      this.router.navigate(['/startseite']);
      return;
    }
    this.fetchTemplates();
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

    const field: BuilderField = {
      id: this.createId('field'),
      label: this.fieldForm.controls.label.value.trim(),
      type: this.fieldForm.controls.type.value,
      hint: this.fieldForm.controls.hint.value?.trim() ?? ''
    };

    card.fields = [...card.fields, field];
    section.cards = section.cards.map((c) => (c.id === card.id ? card : c));
    this.sections.update((current) => current.map((s) => (s.id === section.id ? section : s)));

    this.fieldForm.reset({
      sectionId: '',
      cardId: '',
      label: '',
      type: 'text',
      hint: ''
    });
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

  fetchTemplates(): void {
    this.loading.set(true);
    this.error.set(null);

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
          this.error.set('Templates konnten nicht geladen werden.');
        }
      });
  }

  saveTemplate(): void {
    if (!this.authService.isStaff()) {
      this.error.set('Nur Lektoren können Templates erstellen.');
      return;
    }

    if (this.templateForm.invalid) {
      this.templateForm.markAllAsTouched();
      return;
    }

    if (this.sections().length === 0) {
      this.error.set('Bitte fügen Sie mindestens eine Sektion mit Inhalten hinzu.');
      return;
    }

    if (!this.builderHasFields()) {
      this.error.set('Fügen Sie mindestens ein Feld hinzu.');
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
    this.error.set(null);

    this.templateService
      .createTemplate(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (template) => {
          this.templates.update((list) => [template, ...list]);
          this.loading.set(false);
          this.showToast('Template wurde gespeichert.');
          this.templateForm.reset({ name: '' });
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Template konnte nicht gespeichert werden.');
        }
      });
  }

  loadTemplateIntoBuilder(template: TemplateDto): void {
    try {
      const schema = this.decodeSchema(template.schema);
      this.templateForm.controls.name.setValue(`${template.name} (Kopie)`);
      this.setSectionsFromSchema(schema);
      this.showToast('Template wurde in den Builder geladen.');
    } catch {
      this.error.set('Schema konnte nicht geladen werden.');
    }
  }

  resetBuilder(): void {
    this.sections.set([]);
    this.templateForm.reset({ name: '' });
  }

  getCardsForSection(sectionId: string): BuilderCard[] {
    const section = this.sections().find((s) => s.id === sectionId);
    return section ? section.cards : [];
  }

  getFieldTypeLabel(type: TemplateFieldType): string {
    return this.fieldTypeOptions.find((option) => option.value === type)?.label ?? type;
  }

  private buildSchema(): BackendTemplateSchema {
    return {
      sections: this.sections().map((section) => ({
        Name: section.title,
        Fields: section.cards.flatMap((card) =>
          card.fields.map((field) => ({
            Name: this.buildFieldName(card.title, field.label),
            Type: mapUiTypeToBackendType(field.type),
            Required: true,
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

  private createId(scope: string): string {
    return `${scope}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toastMessage.set(null);
      this.toastTimeout = null;
    }, 4000);
  }
}
