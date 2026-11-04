"""Minimal API; uploaded photos are processed in temporary files and deleted."""
import base64
import binascii
import io
import os
import tempfile
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, UnidentifiedImageError
from .upstream_adapter import analyze

MAX_BYTES = 5 * 1024 * 1024
LOCK = Lock()  # serial inference prevents simultaneous heavy model requests
app = FastAPI(title='營養師食物辨識 API', docs_url=None, redoc_url=None)
origins = [s.strip().rstrip('/') for s in os.getenv('CORS_ORIGINS', '').split(',') if s.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['POST', 'GET'], allow_headers=['Content-Type'])

class PhotoRequest(BaseModel):
    image: str

@app.get('/health')
def health():
    root = Path(os.getenv('UPSTREAM_DIR', '/app/upstream'))
    weights = Path(os.getenv('YOLO_WEIGHTS', str(root / 'food256_yv8m_ddp_640/weights/best.pt')))
    csv = Path(os.getenv('NUTRITION_CSV', str(root / 'datasets/nutrition_256.csv')))
    return {'ok': True, 'ai_configured': all(p.is_file() for p in (root / 'nutrition_pipeline.py', weights, csv))}

@app.post('/analyze')
def analyze_image(payload: PhotoRequest, request: Request):
    # Strict image and body-size enforcement; use reverse-proxy limits in production too.
    if len(payload.image) > MAX_BYTES * 1.5 + 120:
        raise HTTPException(status_code=413, detail='照片超過 5MB')
    try:
        _, b64 = payload.image.split(',', 1)
        if not payload.image.startswith(('data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,')):
            raise ValueError('unsupported data URL')
        data = base64.b64decode(b64, validate=True)
        if len(data) > MAX_BYTES:
            raise ValueError('too large')
        with Image.open(io.BytesIO(data)) as im:
            if im.width * im.height > 12_000_000 or im.width < 40 or im.height < 40:
                raise ValueError('invalid dimensions')
            im.verify()
        with Image.open(io.BytesIO(data)) as im:
            im = im.convert('RGB')
            # EXIF and metadata dropped on re-encode; lower computational load.
            im.thumbnail((1280, 1280))
            with tempfile.TemporaryDirectory(prefix='nutrition_') as folder:
                image = Path(folder) / (Path(folder).name + '.jpg')
                im.save(image, 'JPEG', quality=88)
                if not LOCK.acquire(blocking=False):
                    raise HTTPException(status_code=503, detail='AI 目前正在處理另一張照片，請稍後重試')
                try:
                    try:
                        return analyze(str(image))
                    except (FileNotFoundError, RuntimeError) as e:
                        raise HTTPException(status_code=503, detail=str(e)) from e
                    except Exception as e:
                        raise HTTPException(status_code=500, detail='辨識失敗，請聯絡網站管理者') from e
                finally:
                    LOCK.release()
    except HTTPException:
        raise
    except (UnidentifiedImageError, ValueError, binascii.Error, OSError) as e:
        raise HTTPException(status_code=422, detail='無法讀取照片，請上傳 JPG、PNG 或 WEBP（最多 5 MB）') from e
