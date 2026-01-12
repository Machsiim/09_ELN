import { BackendFieldType, BackendTemplateSchema } from '../models/backend-template-schema';
import { TemplateFieldType, TemplateSchema } from '../models/template-schema';

const normalizeType = (value: string | undefined): string => (value ?? '').toLowerCase();

export const mapUiTypeToBackendType = (type: TemplateFieldType): BackendFieldType => {
  switch (type) {
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'boolean':
      return 'boolean';
    case 'media':
    case 'table':
    case 'multiline':
      return 'text';
    default:
      return 'string';
  }
};

export const mapBackendTypeToUiType = (
  backendType?: string,
  uiType?: TemplateFieldType
): TemplateFieldType => {
  if (uiType) {
    return uiType;
  }

  switch (normalizeType(backendType)) {
    case 'int':
    case 'integer':
    case 'float':
    case 'double':
    case 'number':
      return 'number';
    case 'bool':
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
      return 'date';
    case 'text':
    case 'string':
      return 'text';
    default:
      return 'text';
  }
};

export const splitFieldName = (name: string): { cardTitle: string; fieldLabel: string } => {
  const separatorIndex = name.indexOf(' - ');
  if (separatorIndex === -1) {
    return { cardTitle: 'Allgemein', fieldLabel: name };
  }

  return {
    cardTitle: name.slice(0, separatorIndex),
    fieldLabel: name.slice(separatorIndex + 3)
  };
};

export const isBackendSchema = (schema: unknown): schema is BackendTemplateSchema => {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  const sections = (schema as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) {
    return false;
  }
  return sections.some((section) => {
    const fields = (section as { fields?: unknown; Fields?: unknown }).fields
      ?? (section as { Fields?: unknown }).Fields;
    return Array.isArray(fields);
  });
};

export const isUiSchema = (schema: unknown): schema is TemplateSchema => {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  const sections = (schema as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) {
    return false;
  }
  return sections.some((section) => {
    const cards = (section as { cards?: unknown }).cards;
    return Array.isArray(cards);
  });
};
