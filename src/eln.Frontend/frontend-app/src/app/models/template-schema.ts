export type TemplateFieldType =
  | 'text'
  | 'number'
  | 'integer'
  | 'calculated'
  | 'multiline'
  | 'table'
  | 'media'
  | 'date'
  | 'period'
  | 'boolean';

export type FormulaToken =
  | { kind: 'field'; fieldId: string }
  | { kind: 'operator'; op: '+' | '-' | '*' | '/' | '(' | ')' }
  | { kind: 'number'; value: number };

export interface TemplateFieldSchema {
  id: string;
  label: string;
  type: TemplateFieldType;
  required?: boolean;
  hint?: string;
  formula?: FormulaToken[];
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
