import base64
import io
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import app

client = TestClient(app)

def sample_photo():
    im = Image.new('RGB', (80, 80), (240, 180, 120))
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

def test_health():
    r = client.get('/health')
    assert r.status_code == 200 and 'ai_configured' in r.json()

def test_invalid_image():
    r = client.post('/analyze', json={'image': 'data:text/plain;base64,Zm9v'})
    assert r.status_code == 422

def test_missing_model_is_clear(monkeypatch):
    def missing(_):
        raise RuntimeError('AI model is not configured')
    monkeypatch.setattr('backend.main.analyze', missing)
    r = client.post('/analyze', json={'image': sample_photo()})
    assert r.status_code == 503
    assert 'not configured' in r.json()['detail']

def test_mocked_model_returns_items(monkeypatch):
    monkeypatch.setattr('backend.main.analyze', lambda _: {'items':[{'name':'rice','grams':80,'proteinPer100g':2.7,'matched':True}]})
    r = client.post('/analyze', json={'image': sample_photo()})
    assert r.status_code == 200
    assert r.json()['items'][0]['grams'] == 80
