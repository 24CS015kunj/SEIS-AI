"""ChromaDB Client.

Sole adapter to ChromaDB — collection lifecycle, upsert, and
similarity search all pass through this module, keeping the vector
store swappable behind one interface (§5.5). Connection, client
initialization, and health check are prepared without repository
indexing logic in Week 2 (§16 future path to a managed store).
"""
