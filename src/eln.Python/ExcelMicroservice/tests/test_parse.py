from fastapi.testclient import TestClient
from app.main import app
import io, pandas as pd

client = TestClient(app)

def test_health():
    r = client.get('/health')
    assert r.status_code == 200
    assert r.json()['status'] == 'ok'

def test_parse_excel():
    # create a tiny excel in-memory
    df = pd.DataFrame({'Zeit':[1,2], 'Wert':[3.5, 4.1]})
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    bio.seek(0)
    files = {'file': ('test.xlsx', bio, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    r = client.post('/parse-excel', files=files)
    assert r.status_code == 200
    data = r.json()
    assert data['rows'] == 2
    assert 'zeit' in data['columns']
