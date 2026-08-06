---
name: seis-design
description: 10-step feature design methodology for the SEIS project. Triggers when designing any new feature, module, or component for the AI-Powered Software Evolution Intelligence System. Provides the mandatory design checklist, database design template, API design template, and workspace model reference.
---

# SEIS Feature Design Methodology

When designing any new feature, module, or component for the SEIS project, follow this **exact 10-step order**. Never skip steps. Never jump to implementation before completing design.

## Step 1: Business Goal

Explain **why** this feature exists. What problem does it solve? Who benefits?

## Step 2: Functional Requirements

List everything the feature must accomplish. Be exhaustive.

## Step 3: Non-functional Requirements

Address each:
- **Performance** — response time, throughput targets
- **Scalability** — how it handles growth (1000+ workspaces, 10000+ projects, millions of records)
- **Security** — authentication, authorization, input validation, data protection
- **Availability** — uptime, graceful degradation
- **Maintainability** — code organization, testing, documentation
- **Extensibility** — future enhancements, plugin points

## Step 4: Architecture

- Explain where this module belongs in the system (Express, FastAPI, or Frontend).
- Explain how it communicates with other services.
- Show the component diagram or dependency graph.

## Step 5: Data Flow

- Explain the complete request lifecycle from user action to response.
- Include all service boundaries crossed (React → Express → FastAPI → ChromaDB → Gemini).

## Step 6: Database Design

For each collection/table involved:
- **Collection Name & Purpose**
- **Document Schema** (with field types and descriptions)
- **Relationships** (references to other collections)
- **Indexes** (with justification)
- **Constraints & Validation**
- **Query Patterns** (most common queries)
- **Optimization Notes**

For ChromaDB (if applicable):
- **Collection Name**
- **Metadata Schema**
- **Embedding Dimension**
- **Search Strategy**
- **Filtering Rules**
- **Update/Deletion Strategy**

## Step 7: API Design

For each endpoint:
- **Method & Path**
- **Request** (headers, params, body with schema)
- **Response** (success and error schemas)
- **Status Codes** (all possible)
- **Validation Rules**
- **Authentication** (JWT required? roles?)
- **Authorization** (who can access?)
- **Rate Limiting** (if applicable)

## Step 8: Folder Structure

Show the directory organization for this feature. Explain where each file belongs and why.

## Step 9: Code Design

Define:
- **Classes & Interfaces**
- **Services** (business logic layer)
- **Repositories** (data access layer)
- **DTOs** (data transfer objects)
- **Utilities** (helper functions)
- **Dependency Injection** points
- **Error Handling** strategy

## Step 10: Production Implementation

Only now write code. The code must be:
- Enterprise-grade and production-ready
- Following SOLID principles
- Using proper error handling and logging
- Using environment variables for configuration
- Fully consistent with the architecture designed in steps 1–9

---

## Workspace Model Reference

```
Workspace (like a GitHub Organization)
├── Members (users with roles)
├── Projects
│   ├── Frontend Repository
│   ├── Backend Repository
│   ├── AI Repository
│   ├── Documentation Repository
│   └── Infrastructure Repository
├── AI Chat Sessions
├── Analytics
└── Documentation
```

- One user can own multiple workspaces.
- Each workspace contains members, projects, repositories, chat sessions, analytics, documentation.
- Each project can contain multiple repositories.

## MongoDB Collections Reference

MongoDB stores:
- Users
- Workspaces
- Projects
- Repositories
- Members
- Commits Metadata
- Issues Metadata
- Pull Requests Metadata
- Analytics
- Chat Sessions
- Repository Metadata
- Processing Status

## Repository Import Reference

When a repository is connected, fetch:
- Repository metadata
- README
- Folder structure
- Commits
- Issues
- Pull Requests
- Branches
- Contributors
- Release information
- Repository statistics

Store metadata in MongoDB. Process AI-searchable content via FastAPI.
