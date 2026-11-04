"""Adapter for AbdelrahmanElshatlawy/food-recognition-and-nutrition-analyzer.

Loads ORIGINAL upstream functions, replacing only machine-specific top-level constants.
No upstream source is bundled. You must clone that repo and supply its best.pt.
"""
import os
from pathlib import Path
import re
import shutil
import threading
import types

_LOCK = threading.Lock()
_PIPELINE = None


def _replace_assignment(text: str, name: str, value: str) -> str:
    pattern = rf'(?m)^{re.escape(name)}\s*=\s*[^\n]+'
    revised, count = re.subn(pattern, f'{name} = {value!r}', text, count=1)
    if count != 1:
        raise RuntimeError(f'Upstream format changed: missing {name} configuration')
    return revised


def load_pipeline():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    with _LOCK:
        if _PIPELINE is not None:
            return _PIPELINE
        source_root = Path(os.getenv('UPSTREAM_DIR', '/app/upstream')).resolve()
        script = source_root / 'nutrition_pipeline.py'
        weights = Path(os.getenv('YOLO_WEIGHTS', str(source_root / 'food256_yv8m_ddp_640/weights/best.pt'))).resolve()
        nutrition = Path(os.getenv('NUTRITION_CSV', str(source_root / 'datasets/nutrition_256.csv'))).resolve()
        density = Path(os.getenv('DENSITY_CSV', str(source_root / 'datasets/density_overrides_template.csv'))).resolve()
        missing = [str(p) for p in (script, weights, nutrition) if not p.is_file()]
        if missing:
            raise RuntimeError('AI model is not configured. Missing: ' + ', '.join(missing))
        content = script.read_text(encoding='utf-8-sig')
        # The upstream file's final block executes test image on import.
        marker = '# ------------- Run -------------'
        if marker not in content:
            raise RuntimeError('Upstream source changed: cannot locate run section')
        content = content.split(marker, 1)[0]
        for name, val in (
            ('BASE', str(source_root)), ('WEIGHTS', str(weights)),
            ('NUTRITION_CSV', str(nutrition)), ('DENSITY_CSV', str(density)),
            ('TEST_IMAGE', '/nonexistent/test.jpg'),
            ('DEVICE', os.getenv('YOLO_DEVICE', 'cpu')),
        ):
            content = _replace_assignment(content, name, val)
        module = types.ModuleType('upstream_nutrition_pipeline')
        module.__file__ = str(script)
        # Upstream initializes YOLO and MiDaS at import. Network/cache and RAM required.
        exec(compile(content, str(script), 'exec'), module.__dict__)
        if not callable(getattr(module, 'run_one_image', None)):
            raise RuntimeError('Upstream run_one_image not found')
        _PIPELINE = module
        return module


def analyze(image_path: str):
    module = load_pipeline()
    # Upstream writes CSV and annotated images to BASE/out, one folder per image.
    try:
        df, summary = module.run_one_image(image_path, device=os.getenv('YOLO_DEVICE', 'cpu'))
    finally:
        # Original pipeline creates output CSVs and annotated images on disk.
        # Remove any meal-specific files after the response is assembled.
        output = Path(module.BASE) / 'out'
        stem = Path(image_path).stem
        shutil.rmtree(output / stem, ignore_errors=True)
        (output / (stem + '_annot.jpg')).unlink(missing_ok=True)
    rows = df.to_dict(orient='records')
    known = module.food_nutrition or {}
    items = []
    for row in rows:
        name = str(row.get('food', ''))
        nutrients = known.get(name.lower())
        grams = max(0.0, float(row.get('weight_g', 0)))
        # Missing nutritional match must NOT be represented as measured zero.
        items.append({
            'name': name, 'grams': round(grams, 1),
            'proteinPer100g': round(float(nutrients['protein']), 2) if nutrients else None,
            'caloriesPer100g': round(float(nutrients['calories']), 2) if nutrients else None,
            'matched': bool(nutrients),
        })
    return {'items': items, 'source': 'YOLOv8 + MiDaS upstream pipeline',
            'warning': '照片份量屬估算值；未匹配食物營養資料以空值顯示，須人工核對。'}
