"""Core AI pipeline — framework-agnostic domain logic.

Never imports from api/ or services/. Callable from a CLI/batch script
without booting FastAPI, which is what keeps it independently unit
testable (§3.1).
"""
