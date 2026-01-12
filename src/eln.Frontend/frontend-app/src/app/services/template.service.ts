import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TemplateDto {
  id: number;
  name: string;
  schema: string;
  isArchived: boolean;
  hasExistingMeasurements: boolean;
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

  getTemplates(): Observable<TemplateDto[]> {
    return this.http.get<TemplateDto[]>(this.baseUrl);
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
