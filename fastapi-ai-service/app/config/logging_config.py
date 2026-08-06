"""Structured logging setup.

Configures JSON-structured logging with correlation-ID propagation
and per-environment level tuning, per docs/week1-ai-system-design.md
§15 (Logging Strategy) and §19.8 (Logging Configuration).

Wires stdlib ``logging`` and ``structlog`` into a single pipeline so
that both our own code (via ``structlog.get_logger()``) and
third-party libraries that only know about stdlib logging (uvicorn,
httpx, chromadb, ...) render through the *same* handler and the *same*
format -- a log aggregator never has to deal with two different log
shapes coming out of one process.

Reads no environment variables directly and defines no new Settings
fields -- the configuration model is frozen as of Task 4. Every knob
here (``log_level``, ``log_sink``, ``log_sampling_rate``) is an
existing, already-frozen field on :class:`app.config.settings.Settings`,
passed in by the caller.
"""

import logging
import logging.handlers
import random
import sys
from pathlib import Path

import structlog

from app.config.settings import Environment, Settings

# Fixed, non-configurable convention for the LOG_SINK="file" branch.
# Not sourced from Settings/env (frozen as of Task 4) -- file logging is
# a local-debugging convenience, not the primary production path
# (containers log to stdout for the platform's log collector to pick
# up, §19.8), so a static path is the right amount of configurability.
_LOG_DIR = Path("logs")
_LOG_FILE = _LOG_DIR / "seis-ai-service.log"
_LOG_FILE_MAX_BYTES = 10 * 1024 * 1024  # 10 MiB
_LOG_FILE_BACKUP_COUNT = 5

# Noisy third-party loggers get held to WARNING unless we are actively
# debugging -- otherwise httpx/httpcore log a line for every single
# outbound call (Task 10/11 will make many), drowning out our own
# structured events.
_THIRD_PARTY_LOGGERS = ("httpx", "httpcore", "uvicorn.access")


def _debug_sampler(sampling_rate: float) -> structlog.types.Processor:
    """Probabilistically drops DEBUG events at ``sampling_rate`` < 1.0.

    Implements §19.8's "DEBUG-level sampling in high-traffic
    environments" -- a busy service logging every embedding-batch or
    retrieval-candidate detail at DEBUG can otherwise dominate log
    volume/cost long before ERROR-level signal does.
    """

    def processor(
        logger: object, method_name: str, event_dict: structlog.types.EventDict
    ) -> structlog.types.EventDict:
        if method_name == "debug" and sampling_rate < 1.0 and random.random() > sampling_rate:
            raise structlog.DropEvent
        return event_dict

    return processor


def configure_logging(settings: Settings) -> None:
    """Configures stdlib logging + structlog for the entire process.

    Idempotent: reassigns (never appends to) the root logger's handler
    list, so calling this more than once in a process never produces
    duplicate log lines.

    Renderer selection is environment-driven, not TTY-sniffed: DEVELOPMENT
    gets a human-readable colored console renderer; TESTING/STAGING/
    PRODUCTION get JSON, since those are exactly the environments where a
    log aggregator (not a developer's eyes) is the consumer. Deterministic
    per environment rather than guessing from `sys.stdout.isatty()`, which
    would behave differently run locally vs. under Docker/CI for the same
    `SERVICE_ENV`.
    """
    level = getattr(logging, settings.log_level)

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        _debug_sampler(settings.log_sampling_rate),
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    renderer: structlog.types.Processor = (
        structlog.dev.ConsoleRenderer()
        if settings.service_env is Environment.DEVELOPMENT
        else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=[*shared_processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        # Applied only to log records that did NOT originate from
        # structlog (e.g. a bare `logging.getLogger(...).info(...)` call
        # inside a third-party library) so they get the same fields.
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            # Expands `exc_info=True` (set by `logger.exception(...)`)
            # into a real formatted traceback string under the
            # "exception" key. Required for JSONRenderer, which cannot
            # serialize a raw (type, value, traceback) tuple; applied
            # uniformly to the console path too rather than branching,
            # since a consistent, testable pipeline is worth more than
            # ConsoleRenderer's slightly prettier built-in traceback
            # colorizing.
            structlog.processors.format_exc_info,
            renderer,
        ],
    )

    handler: logging.Handler
    if settings.log_sink == "file":
        _LOG_DIR.mkdir(parents=True, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            _LOG_FILE,
            maxBytes=_LOG_FILE_MAX_BYTES,
            backupCount=_LOG_FILE_BACKUP_COUNT,
            encoding="utf-8",
        )
    else:
        handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(level)

    for logger_name in _THIRD_PARTY_LOGGERS:
        logging.getLogger(logger_name).setLevel(
            level if level <= logging.DEBUG else logging.WARNING
        )
