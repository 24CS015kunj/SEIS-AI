"""Retriever.

Embeds the incoming query and executes repository-scoped similarity
search against ChromaDB. The hot path for both chat and search
(§5.6).
"""
