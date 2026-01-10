export type TemplateFieldType =
  | 'text'
  | 'number'
  | 'multiline'
  | 'table'
  | 'media'
  | 'date'
  | 'boolean';

export interface TemplateFieldSchema {
  id: string;
  label: string;
  type: TemplateFieldType;
  hint?: string;
}

export interface TemplateCardSchema {
  id: string;
  title: string;
  subtitle?: string;
  fields: TemplateFieldSchema[];
}

export interface TemplateSectionSchema {
  id: string;
  title: string;
  cards: TemplateCardSchema[];
}

export interface TemplateSchema {
  sections: TemplateSectionSchema[];
}
