import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { TemplateSchema } from '../../models/template-schema';

@Component({
  selector: 'app-create-measurement',
  imports: [CommonModule, ReactiveFormsModule, Header, Footer],
  templateUrl: './create-measurement.html',
  styleUrl: './create-measurement.scss'
})
export class CreateMeasurement implements OnInit {
  private readonly templateService = inject(TemplateService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly templates = signal<TemplateDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedTemplateId = signal<number | null>(null);
  readonly activeSchema = signal<TemplateSchema | null>(null);

  measurementForm: FormGroup | null = null;

  ngOnInit(): void {
    this.fetchTemplates();
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

  onTemplateChange(rawId: string): void {
    if (!rawId) {
      this.selectedTemplateId.set(null);
      this.activeSchema.set(null);
      this.measurementForm = null;
      return;
    }

    const templateId = Number(rawId);
    const template = this.templates().find((t) => t.id === templateId);

    if (!template) {
      this.error.set('Ausgewähltes Template wurde nicht gefunden.');
      return;
    }

    try {
      const schema = this.parseSchema(template.schema);
      this.selectedTemplateId.set(templateId);
      this.activeSchema.set(schema);
      this.buildForm(schema);
      this.error.set(null);
    } catch {
      this.error.set('Template konnte nicht geladen werden.');
      this.activeSchema.set(null);
      this.measurementForm = null;
    }
  }

  onSubmit(): void {
    if (!this.measurementForm) {
      return;
    }

    if (this.measurementForm.invalid) {
      this.measurementForm.markAllAsTouched();
      return;
    }

    console.log('Messung (noch ohne Backend) vorbereitet:', {
      templateId: this.selectedTemplateId(),
      payload: this.measurementForm.value
    });
  }

  trackById(_: number, item: { id?: string | number }): string | number | undefined {
    return item.id ?? _;
  }

  getControlName(sectionId: string, cardId: string, fieldId?: string, label?: string): string {
    const normalizedSection = sectionId || 'section';
    const normalizedCard = cardId || 'card';
    if (fieldId && fieldId.trim().length > 0) {
      return fieldId;
    }

    const sanitizedLabel = (label ?? 'field').toLowerCase().replace(/\s+/g, '-');
    return `${normalizedSection}-${normalizedCard}-${sanitizedLabel}`;
  }

  private buildForm(schema: TemplateSchema): void {
    const controls: Record<string, unknown> = {};

    schema.sections?.forEach((section) => {
      section.cards?.forEach((card) => {
        card.fields?.forEach((field) => {
          const controlName = this.getControlName(section.id, card.id, field.id, field.label);
          const validators = field.type === 'number' ? [Validators.pattern(/^-?\d+(\.\d+)?$/)] : [];
          controls[controlName] = this.fb.control('', validators);
        });
      });
    });

    const controlKeys = Object.keys(controls);
    this.measurementForm = controlKeys.length > 0 ? this.fb.group(controls) : null;
  }

  private parseSchema(schema: string): TemplateSchema {
    const parsed = JSON.parse(schema);
    if (!parsed.sections) {
      throw new Error('Ungültiges Schema');
    }
    return parsed as TemplateSchema;
  }
}
