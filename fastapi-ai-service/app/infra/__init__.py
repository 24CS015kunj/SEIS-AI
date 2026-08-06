"""Infrastructure layer — external system adapters.

Nothing outside this layer talks to ChromaDB, Gemini, the task queue,
cache, or Express directly. Owns no business rules (§3.1).
"""
