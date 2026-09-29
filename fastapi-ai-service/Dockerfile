# =============================================================================
# Stage 1: base - Python 3.13 slim runtime with shared OS packages
# =============================================================================
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install curl for container health check
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Stage 2: builder - Installs native build tools and compiles runtime packages into /install
# =============================================================================
FROM base AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ build-essential python3-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-chroma.txt ./
ARG INSTALL_LEGACY_CHROMA=false
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt
RUN if [ "$INSTALL_LEGACY_CHROMA" = "true" ]; then \
      pip install --no-cache-dir --prefix=/install -r requirements-chroma.txt; \
    fi

# =============================================================================
# Stage 3: development - Local Compose development stage with test/dev tools
# Inherits runtime packages (including Qdrant client) and installs dev tools
# =============================================================================
FROM base AS development

# Copy runtime packages; local Chroma server/client are optional legacy tools.
COPY --from=builder /install /usr/local

# Install dev/test packages (pytest, ruff, mypy, pre-commit) without duplicate runtime download
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY . /app

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-${SERVICE_PORT:-8000}}\" --reload"]

# =============================================================================
# Stage 4: production - Lean production runtime for Render Web Service deployment
# Excludes development tools and compilers, runs 1 worker without reload
# =============================================================================
FROM base AS production

# Copy runtime packages from builder
COPY --from=builder /install /usr/local

# Copy application source code and package metadata
COPY app/ ./app/
COPY pyproject.toml ./

EXPOSE 8000

# Container liveness probe querying FastAPI /health/live on dynamic platform port
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f "http://localhost:${PORT:-${SERVICE_PORT:-8000}}/health/live" || exit 1

# Production startup command with signal forwarding (PID 1) and dynamic port resolution
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-${SERVICE_PORT:-8000}}\" --workers 1"]
