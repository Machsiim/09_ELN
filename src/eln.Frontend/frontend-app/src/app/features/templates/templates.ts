import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  TemplateCardSchema,
  TemplateFieldSchema,
  TemplateFieldType,
  TemplateSchema,
  TemplateSectionSchema
} from '../../models/template-schema';

interface BuilderSection extends TemplateSectionSchema {
  cards: BuilderCard[];
}

interface BuilderCard extends TemplateCardSchema {
  fields: BuilderField[];
}

type BuilderField = TemplateFieldSchema;

@Component({
  selector: 'app-templates',
  imports: [CommonModule, ReactiveFormsModule, Header, Footer],
  templateUrl: './templates.html',
  styleUrl: './templates.scss'
})
export class Templates implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly templateService = inject(TemplateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly templates = signal<TemplateDto[]>([]);
  readonly sections = signal<BuilderSection[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly fieldTypeOptions: { value: TemplateFieldType; label: string }[] = [
    { value: 'text', label: 'Kurztext' },
    { value: 'number', label: 'Zahl' },
    { value: 'multiline', label: 'Langtext' },
    { value: 'table', label: 'Tabelle' },
    { value: 'media', label: 'Bilder / Medien' }
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
          this.successMessage.set('Template wurde gespeichert.');
          this.templateForm.reset({ name: '' });
          this.clearSuccessLater();
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
      this.successMessage.set('Template wurde in den Builder geladen.');
      this.clearSuccessLater();
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

  private buildSchema(): TemplateSchema {
    return {
      sections: this.sections().map((section) => ({
        id: section.id,
        title: section.title,
        cards: section.cards.map((card) => ({
          id: card.id,
          title: card.title,
          subtitle: card.subtitle,
          fields: card.fields.map((field) => ({
            id: field.id,
            label: field.label,
            type: field.type,
            hint: field.hint
          }))
        }))
      }))
    };
  }

  private decodeSchema(schema: string): TemplateSchema {
    const parsed = JSON.parse(schema);
    if (!parsed.sections) {
      throw new Error('Ungültiges Schema');
    }
    return parsed as TemplateSchema;
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

  private builderHasFields(): boolean {
    return this.sections().some((section) =>
      section.cards.some((card) => card.fields && card.fields.length > 0)
    );
  }

  private findSection(sectionId: string): BuilderSection | undefined {
    return this.sections().find((section) => section.id === sectionId);
  }

  private createId(scope: string): string {
    return `${scope}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private clearSuccessLater(): void {
    setTimeout(() => this.successMessage.set(null), 3500);
  }
}
