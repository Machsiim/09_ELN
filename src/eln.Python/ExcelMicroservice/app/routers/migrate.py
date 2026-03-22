from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import uuid
import os
import glob
import asyncio
import httpx
from datetime import datetime

from ..utils import normalize_columns, basic_clean, df_to_full_schema, apply_mapping
import pandas as pd
from io import BytesIO

router = APIRouter(tags=["Migration"], prefix="/migrate")


# --- Models ---

class MigrationStartRequest(BaseModel):
    directory: str = Field(..., description="Verzeichnis mit Excel/CSV-Dateien")
    template_id: int = Field(..., description="Template-ID fuer den Import")
    backend_url: str = Field(default="http://backend:8080", description="Backend-API URL")
    auth_token: Optional[str] = Field(default=None, description="JWT Token fuer Backend-Authentifizierung")


class MigrationFileStatus(BaseModel):
    filename: str
    status: str = "pending"  # pending, processing, completed, failed
    rows: int = 0
    imported: int = 0
    errors: int = 0
    error_message: Optional[str] = None


class MigrationStatus(BaseModel):
    migration_id: str
    status: str = "running"  # running, completed, failed
    directory: str
    template_id: int
    total_files: int = 0
    processed_files: int = 0
    files: List[MigrationFileStatus] = []
    started_at: str
    completed_at: Optional[str] = None


class MigrationHistoryEntry(BaseModel):
    migration_id: str
    started_at: str
    completed_at: Optional[str] = None
    status: str
    directory: str
    template_id: int
    total_files: int
    processed_files: int


# --- In-memory storage ---

_migrations: Dict[str, MigrationStatus] = {}


# --- Endpoints ---

@router.post("/start", response_model=MigrationStatus)
async def start_migration(request: MigrationStartRequest):
    """Start a migration from a directory of Excel/CSV files."""
    if not os.path.isdir(request.directory):
        raise HTTPException(status_code=400, detail=f"Verzeichnis nicht gefunden: {request.directory}")

    # Find all supported files
    patterns = ["*.xlsx", "*.xls", "*.csv"]
    files: List[str] = []
    for pattern in patterns:
        files.extend(glob.glob(os.path.join(request.directory, pattern)))
    files.sort()

    if not files:
        raise HTTPException(status_code=400, detail="Keine Excel/CSV-Dateien im Verzeichnis gefunden.")

    migration_id = str(uuid.uuid4())
    file_statuses = [MigrationFileStatus(filename=os.path.basename(f)) for f in files]

    migration = MigrationStatus(
        migration_id=migration_id,
        status="running",
        directory=request.directory,
        template_id=request.template_id,
        total_files=len(files),
        processed_files=0,
        files=file_statuses,
        started_at=datetime.utcnow().isoformat(),
    )
    _migrations[migration_id] = migration

    # Run migration in background
    asyncio.create_task(_run_migration(migration_id, files, request))

    return migration


@router.get("/status/{migration_id}", response_model=MigrationStatus)
async def get_migration_status(migration_id: str):
    """Get status of a running or completed migration."""
    migration = _migrations.get(migration_id)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration nicht gefunden.")
    return migration


@router.get("/history", response_model=List[MigrationHistoryEntry])
async def get_migration_history():
    """Get history of all migrations."""
    entries = []
    for m in _migrations.values():
        entries.append(MigrationHistoryEntry(
            migration_id=m.migration_id,
            started_at=m.started_at,
            completed_at=m.completed_at,
            status=m.status,
            directory=m.directory,
            template_id=m.template_id,
            total_files=m.total_files,
            processed_files=m.processed_files,
        ))
    entries.sort(key=lambda e: e.started_at, reverse=True)
    return entries


# --- Background task ---

async def _run_migration(
    migration_id: str,
    file_paths: List[str],
    request: MigrationStartRequest,
):
    migration = _migrations[migration_id]
    headers: Dict[str, str] = {}
    if request.auth_token:
        headers["Authorization"] = f"Bearer {request.auth_token}"

    async with httpx.AsyncClient(timeout=120.0) as client:
        for idx, file_path in enumerate(file_paths):
            file_status = migration.files[idx]
            file_status.status = "processing"
            filename = os.path.basename(file_path)

            try:
                # Read and parse the file
                ext = os.path.splitext(filename)[1].lower()

                with open(file_path, "rb") as f:
                    content = f.read()

                # Send file to backend import endpoint
                import_url = f"{request.backend_url}/api/import/"
                if ext == ".csv":
                    import_url += "csv"
                else:
                    import_url += "excel"

                files_payload = {"file": (filename, content)}
                data_payload = {"templateId": str(request.template_id)}

                response = await client.post(
                    import_url,
                    files=files_payload,
                    data=data_payload,
                    headers=headers,
                )

                if response.status_code == 200:
                    result = response.json()
                    file_status.rows = result.get("totalRows", 0)
                    file_status.imported = result.get("successCount", 0)
                    file_status.errors = result.get("errorCount", 0)
                    file_status.status = "completed"
                else:
                    error_detail = response.text[:500]
                    file_status.status = "failed"
                    file_status.error_message = f"HTTP {response.status_code}: {error_detail}"

            except Exception as e:
                file_status.status = "failed"
                file_status.error_message = str(e)[:500]

            migration.processed_files = idx + 1

    # Mark migration as completed
    has_failures = any(f.status == "failed" for f in migration.files)
    migration.status = "completed" if not has_failures else "completed"
    migration.completed_at = datetime.utcnow().isoformat()
