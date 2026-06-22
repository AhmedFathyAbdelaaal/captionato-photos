FROM python:3.11-slim

# Pillow needs a few system libs for JPEG/PNG/WEBP/TIFF handling.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libjpeg62-turbo zlib1g libwebp7 libtiff6 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x ./start.sh

# Uvicorn port — must match the Coolify route for api.photos.captionato.tech.
EXPOSE 8000

CMD ["./start.sh"]
