import {
  Component,
  Input,
  forwardRef,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MediaAttachment } from '../../models/media-attachment';

@Component({
  selector: 'app-media-upload-field',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './media-upload-field.html',
  styleUrl: './media-upload-field.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MediaUploadField),
      multi: true
    }
  ]
})
export class MediaUploadField implements ControlValueAccessor {
  @Input() label = 'Medien';
  @Input() hint?: string;
  @Input() accept = 'image/*';
  @Input() multiple = true;
  @Input() showLabel = false;

  readonly attachments = signal<MediaAttachment[]>([]);
  readonly isDragging = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly expandedPreviews = signal<Set<string>>(new Set());

  disabled = false;

  private onChange: (value: MediaAttachment[]) => void = () => {};
  private onTouched: () => void = () => {};

  trackById(_: number, item: MediaAttachment): string {
    return item.id;
  }

  isPreviewExpanded(id: string): boolean {
    return this.expandedPreviews().has(id);
  }

  handleDragOver(event: DragEvent): void {
    if (this.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  handleDragLeave(event: DragEvent): void {
    if (this.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  async handleDrop(event: DragEvent): Promise<void> {
    if (this.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (!event.dataTransfer) {
      return;
    }
    await this.processFiles(event.dataTransfer.files);
  }

  async handleFileInput(event: Event): Promise<void> {
    if (this.disabled) {
      return;
    }
    const input = event.target as HTMLInputElement;
    if (!input.files) {
      return;
    }
    await this.processFiles(input.files);
    input.value = '';
  }

  removeAttachment(id: string): void {
    if (this.disabled) {
      return;
    }
    const updated = this.attachments().filter((item) => item.id !== id);
    this.attachments.set(updated);
    this.expandedPreviews.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    this.onChange(updated);
    this.onTouched();
  }

  writeValue(value: MediaAttachment[] | null): void {
    this.attachments.set(value ?? []);
    this.expandedPreviews.set(new Set());
  }

  registerOnChange(fn: (value: MediaAttachment[]) => void): void {
    this.onChange = fn;
  }

  togglePreview(id: string): void {
    if (this.disabled) {
      return;
    }
    this.expandedPreviews.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  private async processFiles(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const files = Array.from(fileList);
    const acceptedTypes = (this.accept ?? '').split(',').map((type) => type.trim());

    const newAttachments: MediaAttachment[] = [];
    for (const file of files) {
      if (!this.isFileAccepted(file, acceptedTypes)) {
        this.errorMessage.set(`Dateityp ${file.type || file.name} wird nicht unterstützt.`);
        continue;
      }
      const dataUrl = await this.readFileAsDataUrl(file);
      newAttachments.push({
        id: this.generateId(),
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        dataUrl
      });
    }

    if (newAttachments.length === 0) {
      return;
    }

    const updated = this.multiple ? [...this.attachments(), ...newAttachments] : [newAttachments[0]];
    this.attachments.set(updated);
    this.errorMessage.set(null);
    this.onChange(updated);
    this.onTouched();
  }

  private isFileAccepted(file: File, acceptedTypes: string[]): boolean {
    if (!acceptedTypes || acceptedTypes.length === 0 || acceptedTypes[0] === '') {
      return true;
    }
    return acceptedTypes.some((type) => {
      if (type === '*/*') {
        return true;
      }
      if (type.endsWith('/*')) {
        const prefix = type.replace('/*', '');
        return file.type.startsWith(prefix);
      }
      return file.type === type;
    });
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `media-${Math.random().toString(36).slice(2, 11)}`;
  }

  openFileDialog(input: HTMLInputElement): void {
    if (this.disabled) {
      return;
    }
    input.click();
  }
}
