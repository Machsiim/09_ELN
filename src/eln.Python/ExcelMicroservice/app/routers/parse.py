from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from typing import Optional, Dict
import pandas as pd
from io import BytesIO
from ..schemas import ParseResponse
from ..utils import normalize_columns, basic_clean, df_to_preview_schema, apply_mapping

router = APIRouter(tags=["Parsing"])

@router.post("/parse-excel", response_model=ParseResponse)
async def parse_excel(
    file: UploadFile = File(..., description="Excel-Datei (.xlsx/.xls)"),
    mapping: Optional[Dict[str, str]] = Query(default=None, description="Optionales Spalten-Mapping als JSON"),
):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Bitte eine Excel-Datei (.xlsx/.xls) hochladen.")
    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel konnte nicht gelesen werden: {e}")
    df = normalize_columns(df)
    df = apply_mapping(df, mapping or {})
    df = basic_clean(df)
    preview, dtypes = df_to_preview_schema(df)
    return ParseResponse(
        rows=len(df),
        columns=list(df.columns),
        dtypes=dtypes,
        preview=preview,
        warnings=[],
    )

@router.post("/parse-csv", response_model=ParseResponse)
async def parse_csv(
    file: UploadFile = File(..., description="CSV-Datei (.csv)"),
    sep: str = Query(default=",", description="CSV-Separator"),
    mapping: Optional[Dict[str, str]] = Query(default=None, description="Optionales Spalten-Mapping als JSON"),
    encoding: str = Query(default="utf-8", description="Zeichenkodierung"),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Bitte eine CSV-Datei (.csv) hochladen.")
    content = await file.read()
    try:
        df = pd.read_csv(BytesIO(content), sep=sep, encoding=encoding)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV konnte nicht gelesen werden: {e}")
    df = normalize_columns(df)
    df = apply_mapping(df, mapping or {})
    df = basic_clean(df)
    preview, dtypes = df_to_preview_schema(df)
    return ParseResponse(
        rows=len(df),
        columns=list(df.columns),
        dtypes=dtypes,
        preview=preview,
        warnings=[],
    )
