"""API layer — FastAPI routers and request/response schemas.

Owns HTTP concerns only (routing, DTO validation, auth guard). Never
contains business logic or direct calls to ChromaDB/Gemini — those
belong to the Service and Infrastructure layers (§3.1).
"""
