---
name: seis-ai-pipeline
description: Complete AI and RAG pipeline implementation guide for the SEIS project. Triggers when implementing any AI feature including repository processing, chunking, embedding, ChromaDB, retrieval, prompt engineering, Gemini integration, semantic search, repository chat, software evolution analysis, code intelligence, or AI evaluation. Provides architecture, pipeline stages, metadata schemas, and quality standards.
---

# SEIS AI Pipeline Implementation Guide

This skill defines the complete AI/RAG architecture for the AI-Powered Software Evolution Intelligence System.

---

## AI Service Architecture

```
FastAPI
  ↓
Repository Processing Engine
  ↓
Document Processing
  ↓
Chunking Engine
  ↓
Embedding Service
  ↓
ChromaDB
  ↓
Retriever
  ↓
Context Builder
  ↓
Prompt Builder
  ↓
Gemini
  ↓
Grounded Response
```

## Design Philosophy

Never implement AI first. Always follow:

1. Business Goal
2. Architecture
3. Workflow
4. Data Pipeline
5. Chunking
6. Embedding
7. Metadata
8. Retrieval
9. Prompt Design
10. Evaluation
11. Implementation

---

## Repository Processing Engine

Design as a **modular pipeline** with independently reusable modules:

| Module | Responsibility |
|--------|---------------|
| Repository Loader | Fetch repository data from Express API |
| Repository Validator | Validate repository data completeness |
| Repository Parser | Parse repository structure and metadata |
| Commit Parser | Parse and structure commit history |
| Issue Parser | Parse and structure issues |
| Pull Request Parser | Parse and structure PRs |
| Branch Parser | Parse branch information |
| Contributor Parser | Parse contributor activity |
| Dependency Analyzer | Extract and analyze dependencies |
| Architecture Analyzer | Infer architecture from structure |
| README Processor | Process README and documentation |
| Markdown Processor | Process all markdown files |
| Release Processor | Process release notes and tags |
| Metadata Generator | Generate chunk metadata |
| Chunk Generator | Create semantic chunks |
| Embedding Generator | Generate vector embeddings |
| Vector Indexer | Store embeddings in ChromaDB |
| Synchronization Engine | Handle incremental updates |
| Evolution Analyzer | Analyze software evolution patterns |

---

## Software Evolution Analysis (Core Innovation)

Responsibilities:
- Track **feature evolution** across commits
- Track **module evolution** (file/directory changes over time)
- Track **architecture evolution** (structural changes)
- Track **contributor evolution** (activity patterns)
- Link **commits ↔ issues** (via commit messages, branch names)
- Link **issues ↔ pull requests**
- Generate **repository timeline**
- Detect **frequently modified files** (hotspots)
- Identify **software evolution patterns**
- Assess **repository health**
- Determine **code ownership**
- Generate **engineering insights**

Software evolution data must become **searchable by AI** through embeddings.

---

## Document Processing

### Process These Document Types
- README
- Markdown files
- Source code
- Commits
- Issues
- Pull Requests
- Release Notes
- API Documentation
- Architecture Documents
- Folder Structure descriptions
- Dependency Files (package.json, requirements.txt, etc.)
- Configuration Files

### Ignore
- Images, Videos, Binary files
- Compiled code, Build artifacts
- User credentials, Access tokens

---

## Chunking Strategy

**Do NOT simply split every N characters.** Chunk based on document type:

| Document Type | Chunking Unit |
|--------------|---------------|
| Source Code | Class, Function, Method, Interface, Module |
| Markdown / README | Heading, Section, Subsection |
| Commits | One commit per chunk |
| Issues | One issue per chunk |
| Pull Requests | One PR per chunk |
| Architecture Docs | Logical section |
| Release Notes | One release per chunk |
| Dependency Files | Entire file per chunk |

---

## Chunk Metadata Schema

Every chunk **must** include this metadata:

| Field | Type | Description |
|-------|------|-------------|
| workspace_id | string | Workspace identifier |
| project_id | string | Project identifier |
| repository_id | string | Repository identifier |
| repository_name | string | Human-readable repo name |
| branch | string | Branch name |
| commit_sha | string | Commit SHA (for versioning) |
| file_path | string | File path within repository |
| programming_language | string | Detected language |
| module_name | string | Module or directory name |
| author | string | Author of the content |
| timestamp | datetime | When the content was created/modified |
| chunk_type | string | class, function, method, section, commit, issue, pr, etc. |
| document_type | string | source_code, markdown, commit, issue, pull_request, etc. |
| source_type | string | github, documentation, analysis |
| embedding_version | string | Embedding model version |
| repository_version | string | Processing version for incremental updates |

---

## Embedding Strategy

- **Model:** Sentence Transformers (MVP)
- **Design an abstraction layer** so future models can replace it without code changes
- **Support incremental embedding updates** after new commits (never rebuild entire vector DB unnecessarily)
- Always document: why this model, embedding dimension, performance characteristics, tradeoffs, migration path

---

## ChromaDB Design

| Aspect | Design Rule |
|--------|------------|
| Collections | Separate collection per repository (or per workspace with metadata filtering) |
| Metadata | Store full chunk metadata schema for filtering |
| Workspace Isolation | Never mix workspaces in search results |
| Repository Isolation | Never mix repositories unless explicitly cross-repo search |
| Update Strategy | Incremental — only re-embed changed content |
| Deletion Strategy | Remove chunks for deleted/modified files before re-indexing |
| Search Optimization | Use metadata filters to narrow search scope before similarity search |

---

## Retrieval Pipeline

```
User Question
  ↓
Question Embedding (Sentence Transformers)
  ↓
Metadata Filtering (workspace_id, project_id, repository_id, document_type)
  ↓
Similarity Search (ChromaDB)
  ↓
Top-K Retrieval
  ↓
Re-ranking (future enhancement)
  ↓
Context Builder (assemble retrieved chunks into coherent context)
  ↓
Prompt Builder (system prompt + context + instructions + user question)
  ↓
Gemini
  ↓
Grounded Response (with source references)
```

Every retrieval stage exists for a reason:
- **Metadata filtering** reduces search space and prevents cross-workspace leakage
- **Similarity search** finds semantically relevant content
- **Top-K** balances relevance with context window limits
- **Context builder** assembles chunks into coherent narrative
- **Prompt builder** ensures Gemini has structured instructions

---

## Prompt Engineering Template

Every prompt to Gemini must include:

1. **System Prompt** — Define Gemini's role as a software engineering assistant
2. **Context** — Retrieved chunks with source metadata
3. **Instructions** — What to do with the context (explain, summarize, analyze, etc.)
4. **User Question** — The original question
5. **Safety Rules** — Do not hallucinate, cite sources, stay grounded in context
6. **Expected Output Format** — Structure of the response

---

## AI Capabilities

The AI service must support:

| Capability | Description |
|-----------|-------------|
| Repository Chat | Conversational Q&A about any connected repository |
| Semantic Search | Natural language search across repository knowledge |
| Explain Repository | High-level repository overview |
| Explain Module | Module-level explanation |
| Explain Function | Function-level explanation |
| Explain Commit | Commit analysis and impact |
| Explain Pull Request | PR summary and analysis |
| Explain Issue | Issue context and resolution |
| Architecture Analysis | Inferred architecture explanation |
| Code Understanding | Code logic and pattern explanation |
| Dependency Analysis | Dependency graph and impact |
| Documentation Assistance | Generate or explain documentation |
| Release Summary | Summarize releases and changelogs |
| Repository Timeline | Chronological evolution narrative |
| Engineering Insights | Actionable engineering recommendations |
| Feature Evolution | Track how features changed over time |

---

## Chat Memory

| Aspect | Design |
|--------|--------|
| Workspace Chat | Persistent chat sessions per workspace |
| Repository Chat | Chat sessions scoped to specific repositories |
| Conversation Context | Include recent conversation history in prompts |
| Retrieved Chunks | Track which chunks were retrieved per message |
| Prompt History | Store prompts for debugging and evaluation |
| Future | Long-term engineering memory across sessions |

---

## Evaluation Metrics

| Metric | What It Measures |
|--------|-----------------|
| Retrieval Precision | % of retrieved chunks that are relevant |
| Retrieval Recall | % of relevant chunks that were retrieved |
| Groundedness | % of response claims backed by retrieved context |
| Hallucination Rate | % of response claims NOT in retrieved context |
| Latency | End-to-end response time |
| Embedding Time | Time to generate embeddings |
| Context Length | Tokens used for context |
| Token Usage | Total tokens per request |
| Response Quality | Human-judged answer quality |

---

## Optimization Checklist

When optimizing AI performance, consider:
- Chunk size tuning
- Top-K value tuning
- Embedding caching
- Metadata filter optimization
- Embedding batch size
- Incremental embedding (only new/changed content)
- Vector search index performance
- Prompt length optimization
- Latency reduction
- Cost optimization (token usage)

---

## Error Handling

Handle these failure modes gracefully with meaningful error messages:

| Error | Handling |
|-------|---------|
| Invalid Repository | Validate before processing |
| Missing Repository | Return 404 with clear message |
| Embedding Failure | Retry with backoff, log failure |
| Vector DB Failure | Circuit breaker, fallback response |
| Gemini Failure | Retry with backoff, return partial context |
| Rate Limit | Queue and retry, inform user |
| Timeout | Cancel and return partial results |
| Invalid Context | Filter out bad chunks, log warning |
| Repository Not Processed | Return processing status, suggest waiting |

---

## Observability

Every AI operation must include:
- **Structured logging** (JSON format)
- **Execution time** tracking
- **Embedding time** per batch
- **Retrieval time** per query
- **LLM response time** per request
- **Error tracking** with stack traces
- **Warning logging** for degraded quality
- **Debug information** for development

---

## FastAPI Service Architecture

```
app/
├── api/
│   ├── routes/          # API route definitions
│   └── dependencies/    # FastAPI dependency injection
├── controllers/         # Request handling, validation
├── services/            # Business logic layer
├── pipelines/           # Processing pipelines
│   ├── processing/      # Repository processing
│   ├── chunking/        # Chunking engine
│   ├── embedding/       # Embedding service
│   └── evolution/       # Evolution analysis
├── retrievers/          # Retrieval logic
├── prompt/              # Prompt building
├── vectorstore/         # ChromaDB integration
├── models/              # Data models
├── schemas/             # Pydantic schemas (DTOs)
├── core/                # Configuration, logging, exceptions
├── utils/               # Helper utilities
└── tests/               # Test suite
```

Never place business logic inside routes. Use the service layer.
