# Architecture

## Core data flow

    test failure or QA observation
    → local ingestion record
    → project-scoped retrieval
    → draft lesson
    → human review and approval
    → durable Markdown memory
    → rebuildable SQLite full-text index

Memory QA supports investigation knowledge around existing test stacks. It does not execute tests, run a hosted service, or call an AI model.

## Packages

- packages/core contains workspace, ingestion, retrieval, draft, approval, Markdown, and SQLite operations.
- packages/cli exposes those operations as local commands.
- packages/mcp exposes local MCP tool definitions over the same core operations. A host must supply the MCP transport and workspace configuration.

## Durable and generated data

Reviewed memory is Markdown. The SQLite full-text index is disposable and can be rebuilt from Markdown. Ingestions, drafts, and project metadata are stored in the local workspace.

Project aliases constrain client-project retrieval. Shared scopes are explicit. They do not provide operating-system access control; workspace permissions and data placement remain the user's responsibility.

The local metadata directory retains the historical .prochat name so existing beta workspaces remain usable.

## AI and MCP boundary

No model SDK, model endpoint, API credential, or remote inference call appears in the core, CLI, or MCP tool layer. A person may supply retrieved memory to an AI assistant, or connect a host-provided MCP transport to the local tool definitions.

The MCP package is not a standalone MCP server.
