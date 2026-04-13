FRONTEND_DIR := frontend

.PHONY: all install install-dev build build-frontend clean dev-backend dev-frontend

# Default: build frontend then install
all: install

# Build frontend + install Python package
install: build-frontend
	pip install .

# Build frontend + install in editable mode (development)
install-dev: build-frontend
	pip install -e .

# Build distributable wheel (dist/)
build: build-frontend
	python -m build

# Build frontend assets into fileviewer/static/
build-frontend:
	cd $(FRONTEND_DIR) && pnpm install && pnpm build

# Remove build artifacts
clean:
	rm -rf dist/ build/ *.egg-info
	rm -rf fileviewer/static/*

# Start backend dev server (port 8001)
dev-backend:
	uvicorn fileviewer.server:app --reload --host 0.0.0.0 --port 8001

# Start frontend dev server (proxies /api to port 8001)
dev-frontend:
	cd $(FRONTEND_DIR) && pnpm dev
