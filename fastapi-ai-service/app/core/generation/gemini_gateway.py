"""Gemini Gateway.

Sole integration point with Gemini — every generation call in the
system passes through this module (§5.9). Response generation is
intentionally out of scope until the RAG pipeline is implemented;
this module currently exists to establish the interface boundary.
"""
