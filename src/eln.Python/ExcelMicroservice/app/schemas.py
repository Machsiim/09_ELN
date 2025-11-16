from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ParseResponse(BaseModel):
    rows: int
    columns: List[str]
    dtypes: Dict[str, str] = Field(..., description="Infertes Datentyp-Schema je Spalte")
    preview: List[Dict[str, Any]] = Field(..., description="Erste 10 Zeilen als JSON")
    warnings: Optional[List[str]] = None
