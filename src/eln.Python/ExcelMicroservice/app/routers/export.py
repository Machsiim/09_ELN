from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from io import BytesIO, StringIO
import csv

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

router = APIRouter(tags=["Export"])


class ExportRequest(BaseModel):
    data: List[Dict[str, Any]] = Field(..., description="Zeilen als Liste von Dictionaries")
    columns: List[str] = Field(..., description="Spaltenreihenfolge")
    column_sections: Optional[Dict[str, str]] = Field(default=None, description="Zuordnung Spaltenname -> Sektionsname")
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

    # Styles
    section_font = Font(bold=True, color="FFFFFF", size=11)
    section_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
    section_alignment = Alignment(horizontal="center", vertical="center")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    has_sections = request.column_sections and len(request.column_sections) > 0
    data_start_row = 3 if has_sections else 2

    if has_sections:
        # Build ordered list of (section_name, start_col, end_col) for merging
        section_ranges = []
        current_section = None
        range_start = 1
        for col_idx, col_name in enumerate(request.columns, start=1):
            section = request.column_sections.get(col_name, "")
            if section != current_section:
                if current_section is not None:
                    section_ranges.append((current_section, range_start, col_idx - 1))
                current_section = section
                range_start = col_idx
        if current_section is not None:
            section_ranges.append((current_section, range_start, len(request.columns)))

        # Write section header row (row 1) with merged cells
        for section_name, start_col, end_col in section_ranges:
            if start_col == end_col:
                cell = ws.cell(row=1, column=start_col, value=section_name)
            else:
                ws.merge_cells(start_row=1, start_column=start_col, end_row=1, end_column=end_col)
                cell = ws.cell(row=1, column=start_col, value=section_name)
            cell.font = section_font
            cell.fill = section_fill
            cell.alignment = section_alignment
            cell.border = thin_border
            # Apply border and fill to all cells in merged range
            for c in range(start_col, end_col + 1):
                ws.cell(row=1, column=c).border = thin_border
                ws.cell(row=1, column=c).fill = section_fill

        # Write field header row (row 2)
        for col_idx, col_name in enumerate(request.columns, start=1):
            cell = ws.cell(row=2, column=col_idx, value=col_name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border
    else:
        # Fallback: single header row (no sections)
        for col_idx, col_name in enumerate(request.columns, start=1):
            cell = ws.cell(row=1, column=col_idx, value=col_name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border

    # Write data rows
    for row_idx, row in enumerate(request.data, start=data_start_row):
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
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 4, 50)

    # Freeze panes below headers
    ws.freeze_panes = f"A{data_start_row}"

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
    writer = csv.writer(output)

    # Write section header row if sections are provided
    if request.column_sections and len(request.column_sections) > 0:
        section_row = [request.column_sections.get(col, "") for col in request.columns]
        writer.writerow(section_row)

    # Write field header row
    writer.writerow(request.columns)

    # Write data rows
    for row in request.data:
        writer.writerow([row.get(col, "") for col in request.columns])

    csv_bytes = output.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    buffer = BytesIO(csv_bytes)

    safe_name = request.filename.replace('"', "").replace("/", "_").replace("\\", "_")

    return StreamingResponse(
        buffer,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'},
    )
