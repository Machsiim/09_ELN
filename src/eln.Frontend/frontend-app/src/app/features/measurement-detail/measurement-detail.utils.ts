import { MediaAttachment } from '../../models/media-attachment';
import { SectionEntry } from './measurement-detail.types';

export const buildSections = (
  source?: Record<string, Record<string, unknown>> | null
): SectionEntry[] => {
  if (!source) {
    return [];
  }

  const sections: SectionEntry[] = [];

  for (const [sectionName, fields] of Object.entries(source)) {
    const cards = new Map<string, { name: string; fields: SectionEntry['cards'][number]['fields'] }>();

    for (const [rawKey, value] of Object.entries(fields)) {
      const separatorIndex = rawKey.indexOf(' - ');
      const cardName = separatorIndex > -1 ? rawKey.slice(0, separatorIndex) : 'Allgemein';
      const fieldLabel = separatorIndex > -1 ? rawKey.slice(separatorIndex + 3) : rawKey;

      if (!cards.has(cardName)) {
        cards.set(cardName, { name: cardName, fields: [] });
      }

      cards.get(cardName)!.fields.push({ key: fieldLabel, value, rawKey });
    }

    sections.push({
      name: sectionName,
      cards: Array.from(cards.values())
    });
  }

  return sections;
};

export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const castValue = (input: string, original: unknown): unknown => {
  if (original === null || original === undefined) {
    return input;
  }
  if (typeof original === 'number') {
    const parsed = Number(input);
    return Number.isNaN(parsed) ? input : parsed;
  }
  if (typeof original === 'boolean') {
    return input.toLowerCase() === 'true';
  }
  return input;
};

export const extractMediaAttachments = (value: unknown): MediaAttachment[] | null => {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const attachments = parsed.filter(
    (item: unknown): item is MediaAttachment =>
      !!item &&
      typeof item === 'object' &&
      'dataUrl' in item &&
      typeof (item as MediaAttachment).dataUrl === 'string'
  );
  return attachments;
};

export const formatMediaSummary = (value: unknown): string => {
  const attachments = extractMediaAttachments(value);
  if (!attachments || attachments.length === 0) {
    return '-';
  }
  if (attachments.length === 1) {
    return attachments[0].name;
  }
  return `${attachments.length} Dateien (${attachments.map((a) => a.name).join(', ')})`;
};
