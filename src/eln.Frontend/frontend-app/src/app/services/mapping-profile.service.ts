import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { PagedResult } from '../models/paged-result';

export interface MappingProfile {
  id: number;
  name: string;
  templateId: number;
  mapping: Record<string, string>;
  createdAt: string;
}

export interface CreateMappingProfile {
  name: string;
  templateId: number;
  mapping: Record<string, string>;
}

@Injectable({
  providedIn: 'root'
})
export class MappingProfileService {
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/mappingprofiles`;

  constructor(private readonly http: HttpClient) {}

  getByTemplatePage(
    templateId: number,
    page = 1,
    pageSize = 20
  ): Observable<PagedResult<MappingProfile>> {
    const params = new HttpParams()
      .set('templateId', templateId)
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<PagedResult<MappingProfile>>(this.baseUrl, { params });
  }

  getByTemplate(templateId: number): Observable<MappingProfile[]> {
    return this.getByTemplatePage(templateId, 1, 100).pipe(map((r) => r.items));
  }

  create(profile: CreateMappingProfile): Observable<MappingProfile> {
    return this.http.post<MappingProfile>(this.baseUrl, profile);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
