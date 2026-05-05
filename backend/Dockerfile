# Slim Python image for the FastAPI backend.
# Used by Koyeb / Fly.io / any container PaaS.
FROM python:3.13-slim

WORKDIR /app

# Install build tools needed for cryptography wheel + clean up after.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Cache deps separately from source for faster rebuilds.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Koyeb / Render / Fly all inject PORT. Default to 8000 for local docker run.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
