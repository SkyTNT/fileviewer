PORT ?= 8001
PATH_ARG ?= .

.PHONY: install install-archive install-frontend dev serve build

install:
	pnpm install
	pnpm run build
	pip install .

install-archive:
	pnpm install
	pnpm run build
	pip install ".[archive]"

dev:
	pnpm run dev

serve:
	fileviewer $(PATH_ARG) --port $(PORT) --write

build:
	pnpm install
	pnpm run build
	pip wheel . --no-deps -w dist/
