import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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

  getByTemplate(templateId: number): Observable<MappingProfile[]> {
    return this.http.get<MappingProfile[]>(`${this.baseUrl}?templateId=${templateId}`);
  }

  create(profile: CreateMappingProfile): Observable<MappingProfile> {
    return this.http.post<MappingProfile>(this.baseUrl, profile);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
