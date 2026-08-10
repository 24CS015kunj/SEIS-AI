"""Gemini Client.

Low-level Gemini SDK/API client wrapped by the Gemini Gateway
(§5.9, §core/generation/gemini_gateway.py). Owns connection setup,
authentication, and raw request/response handling only — no prompt or
business logic.
"""
