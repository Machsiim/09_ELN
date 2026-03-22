from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from io import BytesIO, StringIO
import csv

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

router = APIRouter(tags=["Export"])


class ExportRequest(BaseModel):
    data: List[Dict[str, Any]] = Field(..., description="Zeilen als Liste von Dictionaries")
    columns: List[str] = Field(..., description="Spaltenreihenfolge")
    filename: str = Field(default="Export", description="Dateiname ohne Erweiterung")
    sheet_name: str = Field(default="Daten", description="Sheet-Name fuer Excel")


@router.post("/export/excel")
async def export_excel(request: ExportRequest):
    """Generate a formatted Excel file from data rows."""
    if not request.columns:
        raise HTTPException(status_code=400, detail="Keine Spalten angegeben.")

    wb = Workbook()
    ws = wb.active
    ws.title = request.sheet_name[:31]

    # Header styles
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    # Write headers
    for col_idx, col_name in enumerate(request.columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    # Write data rows
    for row_idx, row in enumerate(request.data, start=2):
        for col_idx, col_name in enumerate(request.columns, start=1):
            value = row.get(col_name)
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.border = thin_border

    # Auto-width
    for col_idx, col_name in enumerate(request.columns, start=1):
        max_len = len(str(col_name))
        for row in request.data:
            val = row.get(col_name)
            if val is not None:
                max_len = max(max_len, len(str(val)))
        ws.column_dimensions[ws.cell(1, col_idx).column_letter].width = min(max_len + 4, 50)

    ws.freeze_panes = "A2"

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    safe_name = request.filename.replace('"', "").replace("/", "_").replace("\\", "_")

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'},
    )


@router.post("/export/csv")
async def export_csv(request: ExportRequest):
    """Generate a CSV file from data rows."""
    if not request.columns:
        raise HTTPException(status_code=400, detail="Keine Spalten angegeben.")

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=request.columns, extrasaction="ignore")
    writer.writeheader()
    for row in request.data:
        writer.writerow({col: row.get(col, "") for col in request.columns})

    csv_bytes = output.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    buffer = BytesIO(csv_bytes)

    safe_name = request.filename.replace('"', "").replace("/", "_").replace("\\", "_")

    return StreamingResponse(
        buffer,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'},
    )
