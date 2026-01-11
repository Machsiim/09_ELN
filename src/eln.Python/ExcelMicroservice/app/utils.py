import pandas as pd
from typing import Dict, Tuple, List, Any

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df

def apply_mapping(df: pd.DataFrame, mapping: Dict[str, str]) -> pd.DataFrame:
    if not mapping:
        return df
    # Map logical->physical or vice versa; accept either direction
    # Build a rename dict only for existing columns
    rename = {src: dst for src, dst in mapping.items() if src in df.columns}
    if not rename:
        # maybe mapping was given inverted
        rename = {dst: src for src, dst in mapping.items() if dst in df.columns}
    return df.rename(columns=rename)

def basic_clean(df: pd.DataFrame) -> pd.DataFrame:
    # Drop fully-empty rows; keep index reset
    df = df.dropna(how="all").reset_index(drop=True)
    return df

def _to_native(value: Any) -> Any:
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return value
    return value

def df_to_preview_schema(df: pd.DataFrame, n: int = 10) -> Tuple[List[dict], dict]:
    preview = df.head(n).where(pd.notna(df), None).to_dict(orient="records")
    preview = [{k: _to_native(v) for k, v in row.items()} for row in preview]
    dtypes = {c: str(t) for c, t in df.dtypes.items()}
    return preview, dtypes
