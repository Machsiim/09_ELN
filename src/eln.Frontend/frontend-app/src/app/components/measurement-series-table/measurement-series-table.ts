import { CommonModule } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { formatValue } from '../../features/measurement-detail/measurement-detail.utils';

export interface SeriesTableMeasurement {
  id: number;
  templateId?: number;
  templateName: string;
  data: Record<string, Record<string, unknown>>;
  createdByUsername: string;
  createdAt: string;
}

interface HeaderField {
  column: string;
  label: string;
}

interface HeaderCard {
  title: string;
  fields: HeaderField[];
}

interface HeaderSection {
  title: string;
  cards: HeaderCard[];
  fieldCount: number;
  colorIndex: number;
}

interface TemplateGroup {
  key: string;
  name: string;
  measurements: SeriesTableMeasurement[];
  sections: HeaderSection[];
}

@Component({
  selector: 'app-measurement-series-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './measurement-series-table.html',
  styleUrl: './measurement-series-table.scss'
})
export class MeasurementSeriesTable {
  readonly measurements = input.required<SeriesTableMeasurement[]>();
  readonly visibleColumns = input<Set<string> | null>(null);
  readonly selectable = input(false);
  readonly selectionDisabled = input(false);
  readonly selectedIds = input<Set<number>>(new Set());

  readonly measurementClick = output<SeriesTableMeasurement>();
  readonly selectionChange = output<{ id: number; selected: boolean }>();

  readonly groups = computed(() => this.buildGroups());
  readonly hasMultipleTemplates = computed(() => this.groups().length > 1);

  isBaseVisible(column: string): boolean {
    const visible = this.visibleColumns();
    return visible === null || visible.has(column);
  }

  isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  getValue(measurement: SeriesTableMeasurement, column: string): string {
    const separator = column.indexOf(' - ');
    if (separator < 0) return '-';

    const sectionName = column.slice(0, separator);
    const fieldName = column.slice(separator + 3);
    return formatValue(measurement.data?.[sectionName]?.[fieldName]);
  }

  private buildGroups(): TemplateGroup[] {
    const grouped = new Map<string, {
      name: string;
      measurements: SeriesTableMeasurement[];
      sections: Map<string, Map<string, HeaderField[]>>;
    }>();

    for (const measurement of this.measurements()) {
      const key = measurement.templateId != null
        ? String(measurement.templateId)
        : measurement.templateName || 'Unbekannt';
      let group = grouped.get(key);
      if (!group) {
        group = {
          name: measurement.templateName || 'Unbekannt',
          measurements: [],
          sections: new Map()
        };
        grouped.set(key, group);
      }
      group.measurements.push(measurement);

      for (const [sectionName, section] of Object.entries(measurement.data ?? {})) {
        let cards = group.sections.get(sectionName);
        if (!cards) {
          cards = new Map();
          group.sections.set(sectionName, cards);
        }

        for (const fieldKey of Object.keys(section ?? {})) {
          const column = `${sectionName} - ${fieldKey}`;
          const visible = this.visibleColumns();
          if (visible !== null && !visible.has(column)) continue;

          const separator = fieldKey.indexOf(' - ');
          const cardTitle = separator >= 0 ? fieldKey.slice(0, separator) : fieldKey;
          const label = separator >= 0 ? fieldKey.slice(separator + 3) : fieldKey;
          const fields = cards.get(cardTitle) ?? [];
          if (!fields.some((field) => field.column === column)) {
            fields.push({ column, label });
            cards.set(cardTitle, fields);
          }
        }
      }
    }

    return Array.from(grouped, ([key, group]) => ({
      key,
      name: group.name,
      measurements: group.measurements,
      sections: Array.from(group.sections, ([title, cards]) => {
        const headerCards = Array.from(cards, ([cardTitle, fields]) => ({
          title: cardTitle,
          fields
        })).filter((card) => card.fields.length > 0);
        return {
          title,
          cards: headerCards,
          fieldCount: headerCards.reduce((count, card) => count + card.fields.length, 0),
          colorIndex: this.sectionColorIndex(title, key)
        };
      }).filter((section) => section.fieldCount > 0)
    }));
  }

  private sectionColorIndex(section: string, templateKey: string): number {
    let hash = 0;
    for (const char of `${templateKey}:${section}`) {
      hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }
    return Math.abs(hash) % 10;
  }
}
