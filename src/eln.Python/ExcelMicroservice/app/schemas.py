from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ParseResponse(BaseModel):
    rows: int
    columns: List[str]
    dtypes: Dict[str, str] = Field(..., description="Infertes Datentyp-Schema je Spalte")
    preview: List[Dict[str, Any]] = Field(..., description="Erste 10 Zeilen als JSON")
    warnings: Optional[List[str]] = None


class FullParseResponse(BaseModel):
    rows: int
    columns: List[str]
    dtypes: Dict[str, str] = Field(..., description="Infertes Datentyp-Schema je Spalte")
    data: List[Dict[str, Any]] = Field(..., description="Alle Zeilen als JSON")
    warnings: Optional[List[str]] = None


class GenerateSampleRequest(BaseModel):
    model_config = {"populate_by_name": True}

    template_schema: Dict[str, Any] = Field(..., alias="schema", description="Template-Schema (UI- oder Backend-Format)")
    template_name: str = Field(default="Vorlage", description="Name des Templates")
