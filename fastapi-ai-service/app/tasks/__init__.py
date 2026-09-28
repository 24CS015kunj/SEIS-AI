"""Celery task bodies (Task 40+).

``app.infra.queue.task_queue`` (Task 11) configures the Celery
*application* only and defines zero ``@celery_app.task``-decorated
functions by design (see that module's own docstring). This package is
where task bodies actually live, one module per queue-routing prefix
(``app.tasks.ingestion.*`` -> the ``ingestion`` queue,
``app.tasks.evolution.*`` -> the ``evolution`` queue, per
``task_queue.py``'s ``_TASK_ROUTES``).
"""
