"""Metadata Filter & Scope Enforcer.

Task 20 (Phase 4): builds the ChromaDB ``where`` filter clause that
must accompany every scoped vector search, so a caller can never
accidentally run an unscoped (cross-tenant) query (§5.6, ADR-004).

Reconciliation -- ``workspace_id`` (frozen ``ChunkMetadata`` gap):
the task spec asks for ``workspace_id`` to be one of the ``$and``
filter fields alongside ``repository_id``, ``file_path``, and
``chunk_type``. ``ChunkMetadata`` (Task 7, frozen) and
``ChromaClient._metadata_to_chroma`` (Task 9, frozen) deliberately do
not store a ``workspace_id`` key on Chroma documents at all --
``chroma_client.py``'s own module docstring documents this as an
explicit, intentional scope decision, not an oversight: workspace
isolation is achieved *transitively* through the one-collection-per-
repository design, since every ``Repository`` belongs to exactly one
``workspace_id``. Adding a ``workspace_id`` key to the ``where``
clause built here would not strengthen isolation; a Chroma equality
match against a metadata key that no stored document ever carries
matches nothing, so every real query would silently return zero
results -- a worse failure mode than the cross-tenant leakage this
filter exists to prevent, and a change to the frozen Chroma metadata
schema is out of scope for this task. ``build_scope_filter`` therefore
still validates ``workspace_id`` is present (Subtask 3 -- catching a
caller that forgot to resolve scope at all) but does not add it as a
``where`` clause key.

Only ``repository_id`` and ``document_type`` (the plural
``document_types`` param maps onto ``ChunkMetadata.document_type``)
are fields this builder can actually express, since those are the
only scope-relevant keys ``ChromaClient`` writes into Chroma metadata.
``repository_id`` is included as an explicit belt-and-suspenders
``where`` clause even though ``ChromaClient.query_similarity`` already
scopes by collection name (Task 19) -- defense in depth matching this
task's own architecture reasoning ("guarantees strict isolation at the
database layer", not only at the collection-selection layer).
"""

from __future__ import annotations

from app.domain.enums import DocumentType
from app.domain.exceptions import DomainValidationError


class MetadataFilterBuilder:
    """Builds mandatory ChromaDB scope filters (Task 20, §5.6, ADR-004)."""

    @staticmethod
    def build_scope_filter(
        workspace_id: str,
        repository_id: str,
        document_types: list[str] | None = None,
    ) -> dict[str, object]:
        """Returns a ChromaDB-compatible ``where`` filter scoped to one
        repository, optionally narrowed to a set of document types.

        Raises :class:`DomainValidationError` immediately if
        ``workspace_id`` or ``repository_id`` is empty/blank (Best
        Practices) or if ``document_types`` contains a value that
        isn't a known :class:`DocumentType` -- never build a filter
        that would silently match nothing because of a typo.
        """
        if not workspace_id or not workspace_id.strip():
            raise DomainValidationError(
                "workspace_id must be a non-empty string -- refusing to build a "
                "vector search filter without a resolved tenant scope (ADR-004).",
                details={},
            )
        if not repository_id or not repository_id.strip():
            raise DomainValidationError(
                "repository_id must be a non-empty string -- refusing to build a "
                "vector search filter without a resolved repository scope (ADR-004).",
                details={"workspace_id": workspace_id},
            )

        clauses: list[dict[str, object]] = [{"repository_id": repository_id}]

        if document_types:
            normalized: list[str] = []
            for value in document_types:
                try:
                    normalized.append(DocumentType(value).value)
                except ValueError as exc:
                    raise DomainValidationError(
                        f"Unknown document_type filter value: {value!r}",
                        details={"document_types": document_types},
                    ) from exc
            clauses.append({"document_type": {"$in": normalized}})

        if len(clauses) == 1:
            return clauses[0]
        # Chroma's `where` clause requires an explicit boolean operator
        # once more than one key is present -- same convention as
        # `ChromaClient._build_where` (Task 9).
        return {"$and": clauses}
