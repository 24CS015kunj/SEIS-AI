"""Embedder.

Converts Chunk objects into dense vector representations, batched for
throughput and checked against the Embedding Cache before recomputing
(§5.4, §19.4).
"""
