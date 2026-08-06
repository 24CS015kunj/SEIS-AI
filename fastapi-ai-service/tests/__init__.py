"""Test suite root.

unit/ tests the Core Pipeline in isolation (no FastAPI, no network).
integration/ tests the Service Layer against a test ChromaDB instance.
e2e/ tests full request/response paths (§27 Production Readiness
Checklist, Testing).
"""
