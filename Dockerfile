FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
# Pull upstream source. Model weights are NOT bundled; see README setup.
ARG UPSTREAM_COMMIT=main
RUN git clone --depth 1 https://github.com/AbdelrahmanElshatlawy/food-recognition-and-nutrition-analyzer.git /app/upstream && \
    cd /app/upstream && if [ "$UPSTREAM_COMMIT" != "main" ]; then git fetch --depth 1 origin "$UPSTREAM_COMMIT" && git checkout --detach FETCH_HEAD; fi
ENV UPSTREAM_DIR=/app/upstream YOLO_DEVICE=cpu PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
