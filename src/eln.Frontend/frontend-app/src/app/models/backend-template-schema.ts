import { FormulaToken, TemplateFieldType } from './template-schema';

export type BackendFieldType =
  | 'int'
  | 'integer'
  | 'float'
  | 'double'
  | 'number'
  | 'string'
  | 'text'
  | 'bool'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'period'
  | 'calculated';

export interface BackendTemplateFieldSchema {
  id?: string;
  Id?: string;
  name?: string;
  Name?: string;
  type?: BackendFieldType;
  Type?: BackendFieldType;
  required?: boolean;
  Required?: boolean;
  description?: string;
  Description?: string;
  defaultValue?: unknown;
  DefaultValue?: unknown;
  uiType?: TemplateFieldType;
  UiType?: TemplateFieldType;
  formula?: FormulaToken[];
  Formula?: FormulaToken[];
}

export interface BackendTemplateSectionSchema {
  name?: string;
  Name?: string;
  description?: string;
  Description?: string;
  fields?: BackendTemplateFieldSchema[];
  Fields?: BackendTemplateFieldSchema[];
}

export interface BackendTemplateSchema {
  sections: BackendTemplateSectionSchema[];
}
