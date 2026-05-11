import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { PagedResult } from '../models/paged-result';

export interface TemplateDto {
  id: number;
  name: string;
  schema: string;
  isArchived: boolean;
  hasExistingMeasurements: boolean;
  usageCount: number;
}

export interface SaveTemplateDto {
  name: string;
  schema: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/templates`;

  getTemplatesPage(page = 1, pageSize = 20): Observable<PagedResult<TemplateDto>> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<PagedResult<TemplateDto>>(this.baseUrl, { params });
  }

  getTemplates(): Observable<TemplateDto[]> {
    return this.getTemplatesPage(1, 100).pipe(map((r) => r.items));
  }

  createTemplate(payload: SaveTemplateDto): Observable<TemplateDto> {
    return this.http.post<TemplateDto>(this.baseUrl, payload);
  }

  updateTemplate(id: number, payload: SaveTemplateDto): Observable<TemplateDto> {
    return this.http.put<TemplateDto>(`${this.baseUrl}/${id}`, payload);
  }

  deleteTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  archiveTemplate(id: number): Observable<TemplateDto> {
    return this.http.put<TemplateDto>(`${this.baseUrl}/${id}/archive`, {});
  }
}
