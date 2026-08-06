"""Repository Processing Engine orchestration service.

Coordinates Document Processor -> Chunker -> Embedder -> ChromaDB
Client and drives ProcessingStatus transitions (§5.1, §6, §22).
"""
