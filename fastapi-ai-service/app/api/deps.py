"""Shared FastAPI dependencies.

Provides the service-to-service auth guard (§26.1-§26.2) and injected
access to settings, the structured logger, and infrastructure clients
(ChromaDB, Gemini) used across route handlers (§8 Dependency
Injection).
"""
