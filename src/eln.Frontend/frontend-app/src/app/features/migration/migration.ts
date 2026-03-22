import { Component, OnInit, signal, OnDestroy } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { AuthService } from '../../services/auth.service';

interface MigrationFileStatus {
  filename: string;
  status: string;
  rows: number;
  imported: number;
  errors: number;
  error_message?: string | null;
}

interface MigrationStatus {
  migration_id: string;
  status: string;
  directory: string;
  template_id: number;
  total_files: number;
  processed_files: number;
  files: MigrationFileStatus[];
  started_at: string;
  completed_at?: string | null;
}

interface MigrationHistoryEntry {
  migration_id: string;
  started_at: string;
  completed_at?: string | null;
  status: string;
  directory: string;
  template_id: number;
  total_files: number;
  processed_files: number;
}

@Component({
  selector: 'app-migration',
  imports: [FormsModule, Header, Footer],
  templateUrl: './migration.html',
  styleUrl: './migration.scss',
})
export class Migration implements OnInit, OnDestroy {
  private readonly pythonUrl = environment.pythonApiUrl.replace(/\/$/, '');
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  templates = signal<TemplateDto[]>([]);
  selectedTemplate = '';
  directory = '/data/migration';

  currentMigration = signal<MigrationStatus | null>(null);
  history = signal<MigrationHistoryEntry[]>([]);
  globalError = signal<string | null>(null);
  isStarting = signal(false);

  constructor(
    private readonly http: HttpClient,
    private readonly templateService: TemplateService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    this.templateService.getTemplates().subscribe({
      next: (t) => this.templates.set(t),
      error: () => this.templates.set([])
    });
    this.loadHistory();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  loadHistory(): void {
    this.http.get<MigrationHistoryEntry[]>(`${this.pythonUrl}/migrate/history`).subscribe({
      next: (h) => this.history.set(h),
      error: () => this.history.set([])
    });
  }

  startMigration(): void {
    if (!this.selectedTemplate || this.isStarting()) return;
    this.isStarting.set(true);
    this.globalError.set(null);

    const token = this.authService.getToken();

    this.http.post<MigrationStatus>(`${this.pythonUrl}/migrate/start`, {
      directory: this.directory,
      template_id: Number(this.selectedTemplate),
      backend_url: environment.apiUrl.replace(/\/api\/?$/, ''),
      auth_token: token
    }).subscribe({
      next: (migration) => {
        this.currentMigration.set(migration);
        this.isStarting.set(false);
        this.startPolling(migration.migration_id);
      },
      error: (err) => {
        this.globalError.set(err?.error?.detail ?? 'Migration konnte nicht gestartet werden.');
        this.isStarting.set(false);
      }
    });
  }

  viewMigration(migrationId: string): void {
    this.http.get<MigrationStatus>(`${this.pythonUrl}/migrate/status/${migrationId}`).subscribe({
      next: (m) => {
        this.currentMigration.set(m);
        if (m.status === 'running') {
          this.startPolling(m.migration_id);
        }
      },
      error: () => this.globalError.set('Migration nicht gefunden.')
    });
  }

  private startPolling(migrationId: string): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.http.get<MigrationStatus>(`${this.pythonUrl}/migrate/status/${migrationId}`).subscribe({
        next: (m) => {
          this.currentMigration.set(m);
          if (m.status !== 'running') {
            this.stopPolling();
            this.loadHistory();
          }
        }
      });
    }, 2000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  closeMigrationView(): void {
    this.currentMigration.set(null);
    this.stopPolling();
    this.loadHistory();
  }

  getFileStatusClass(status: string): string {
    switch (status) {
      case 'completed': return 'status-success';
      case 'failed': return 'status-error';
      case 'processing': return 'status-processing';
      default: return 'status-pending';
    }
  }

  getFileStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Abgeschlossen';
      case 'failed': return 'Fehlgeschlagen';
      case 'processing': return 'Wird verarbeitet...';
      default: return 'Ausstehend';
    }
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('de-DE');
  }
}
