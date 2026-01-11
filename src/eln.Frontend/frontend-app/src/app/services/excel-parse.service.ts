import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ExcelParseResponse {
  rows: number;
  columns: string[];
  dtypes: Record<string, string>;
  preview: Array<Record<string, unknown>>;
  warnings?: string[] | null;
}

@Injectable({
  providedIn: 'root'
})
export class ExcelParseService {
  private readonly baseUrl = environment.pythonApiUrl.replace(/\/$/, '');

  constructor(private readonly http: HttpClient) {}

  parseExcel(file: File, headerRow: number): Observable<ExcelParseResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl}/parse-excel`;
    return this.http.post<ExcelParseResponse>(url, formData, {
      params: { headerRow: String(headerRow) }
    });
  }
}
