export interface SectionEntry {
  name: string;
  cards: CardEntry[];
}

export interface CardEntry {
  name: string;
  fields: FieldEntry[];
}

export interface FieldEntry {
  type?: string;
  key: string;
  value: unknown;
  rawKey: string;
}
