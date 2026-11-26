# Una sola imagen para la API (servicio `web`) y el worker (ver docs/DECISIONES.md, D3 y D4).

# --- 1. Frontend compilado ---------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /web
COPY front/package.json front/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY front/ ./
RUN npm run build

# --- 2. Parser de precios en Rust (D10) --------------------------------------
# La imagen de maturin produce wheels manylinux compatibles con la de Playwright.
# Los tests del crate (incluidos los de propiedades) se ejecutan en cada build.
FROM ghcr.io/pyo3/maturin:v1.7.8 AS precio-build
RUN rustup toolchain install 1.88.0 --profile minimal && rustup default 1.88.0
WORKDIR /precio
COPY precio/Cargo.toml precio/Cargo.lock precio/pyproject.toml ./
COPY precio/src ./src
RUN cargo test --release --locked  && maturin build --release --locked -i python3.10 --out /wheels

# --- 3. Backend con Chromium -------------------------------------------------
FROM mcr.microsoft.com/playwright/python:v1.52.0-jammy AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY --from=precio-build /wheels/ /tmp/wheels/
RUN pip install /tmp/wheels/*.whl && rm -rf /tmp/wheels
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app

# --- 4. Tests: docker build --target test -t atmospheric-analyst:test . ------
FROM backend AS test
COPY backend/requirements-dev.txt backend/pytest.ini backend/ruff.toml ./
RUN pip install -r requirements-dev.txt
COPY backend/tests ./tests
CMD ["python", "-m", "pytest", "-q"]

# --- 5. Imagen final ---------------------------------------------------------
FROM backend AS runtime
COPY --from=web-build /web/dist /app/frontend
# pwuser viene en la imagen de Playwright: no se ejecuta como root.
USER pwuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
