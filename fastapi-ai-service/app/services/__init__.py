"""Service layer — orchestration across Core Pipeline modules.

Owns transaction/orchestration logic and lifecycle state transitions.
Never contains HTTP concerns (owned by the API layer) or direct
external-system calls (owned by Infrastructure) (§3.1).
"""
