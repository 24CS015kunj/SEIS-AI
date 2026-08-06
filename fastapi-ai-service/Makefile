# Convenience task runner for Linux/macOS shells and the CI container.
# On native Windows, run the underlying commands directly (documented in
# the Task 2 write-up) — `make` is not a default Windows tool.

.PHONY: install install-dev lint format typecheck test test-cov run clean

install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements-dev.txt
	pre-commit install

lint:
	ruff check .

format:
	ruff format .
	ruff check --fix .

typecheck:
	mypy app

test:
	pytest

test-cov:
	pytest --cov --cov-report=term-missing

run:
	uvicorn app.main:app --reload --port 8000

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage
