import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ImportResponse {
  totalRows: number;
  successCount: number;
  errorCount: number;
  seriesId: number;
  errors: ImportRowError[];
  createdMeasurementIds: number[];
}

export interface ImportRowError {
  row: number;
  field?: string | null;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  importExcel(
    file: File,
    templateId: number,
    seriesId?: number,
    seriesName?: string,
    seriesDescription?: string,
    columnMapping?: Record<string, string>
  ): Observable<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('templateId', String(templateId));
    if (seriesId != null) formData.append('seriesId', String(seriesId));
    if (seriesName) formData.append('seriesName', seriesName);
    if (seriesDescription) formData.append('seriesDescription', seriesDescription);
    if (columnMapping && Object.keys(columnMapping).length > 0) {
      formData.append('columnMapping', JSON.stringify(columnMapping));
    }
    return this.http.post<ImportResponse>(`${this.baseUrl}/import/excel`, formData);
  }

  importCsv(
    file: File,
    templateId: number,
    seriesId?: number,
    seriesName?: string,
    seriesDescription?: string,
    columnMapping?: Record<string, string>
  ): Observable<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('templateId', String(templateId));
    if (seriesId != null) formData.append('seriesId', String(seriesId));
    if (seriesName) formData.append('seriesName', seriesName);
    if (seriesDescription) formData.append('seriesDescription', seriesDescription);
    if (columnMapping && Object.keys(columnMapping).length > 0) {
      formData.append('columnMapping', JSON.stringify(columnMapping));
    }
    return this.http.post<ImportResponse>(`${this.baseUrl}/import/csv`, formData);
  }
}
