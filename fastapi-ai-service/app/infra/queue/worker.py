"""Worker (superseded by Task T5, Architecture E).

Background repository processing is executed in-process by IngestionJobManager
inside the FastAPI web service, eliminating the separate Celery worker container.
"""
