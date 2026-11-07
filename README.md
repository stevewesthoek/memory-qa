# Memory QA

Local-first QA investigation memory for recurring test failures, regression analysis, and reusable engineering knowledge.

Memory QA stores reviewed investigation notes as Markdown and retrieves them when a similar failure returns. It works alongside existing test tools; it does not run tests or replace a test framework.

## Problem

QA investigation knowledge can be scattered across test logs, tickets, and individual notes. When a similar failure returns, engineers may need to reconstruct the earlier diagnosis and resolution. Memory QA provides a local, reviewable place to keep selected lessons and retrieve them by project and query.

> **Provenance:** Memory QA continues software originally developed for ProChat Memory for QA. The private ProChat history and its commercial and pilot materials are not included in this clean source repository. No earlier independent Memory QA release or tag is claimed.

## What it does

- Ingests plain-text failures and JUnit XML into a local workspace.
- Associates evidence with an explicit project alias.
- Retrieves reviewed Markdown knowledge using a local SQLite full-text index.
- Creates memory drafts from ingested evidence.
- Requires human review and approval before a draft becomes reusable memory.
- Rebuilds the search index from Markdown.
- Provides a local MCP tool-definition layer for hosts that supply their own MCP transport.

The core, CLI, and MCP packages do not call an AI model or hosted service. This repository does not include a standalone MCP server.

## Architecture

Durable knowledge is stored as Markdown. SQLite is a generated local search index that can be rebuilt. The CLI, tests, and MCP tool layer use the same core operations.

See [architecture](docs/ARCHITECTURE.md) and [privacy and safety](docs/PRIVACY-AND-SAFETY.md). The proposed future engineering work is listed in [ROADMAP.md](ROADMAP.md).

## Technology

- TypeScript and Node.js for the core library and CLI.
- Markdown files for durable, human-readable knowledge.
- Node.js built-in SQLite with FTS5 for a local, rebuildable search index.
- Vitest for tests and Biome for linting and formatting.

## Requirements and setup

- Node.js 22.13.0 or newer
- npm
- No database service or AI provider account is required for local use.

From the repository root:

    npm ci --ignore-scripts
    npm run build
    node packages/cli/dist/index.js --help

The prochat executable alias and .prochat workspace metadata are retained for existing beta workspaces.

## Quick start

The included login failure fixture is fictional and contains no real client data. Use a new sibling directory for workspace data so it stays outside this source checkout. If the example path already contains data, choose another empty sibling directory.


    node packages/cli/dist/index.js init ../memory-qa-demo-workspace
    node packages/cli/dist/index.js project add demo-project ../memory-qa-demo-workspace
    node packages/cli/dist/index.js ingest ./demo/login-selector-failure/raw-log.txt.md --project demo-project ../memory-qa-demo-workspace
    node packages/cli/dist/index.js index rebuild ../memory-qa-demo-workspace
    node packages/cli/dist/index.js retrieve --project demo-project --query "login submit selector" ../memory-qa-demo-workspace

The ingest command prints an ID. Use it to create a draft, inspect the generated Markdown, and approve only after review:

    node packages/cli/dist/index.js draft create --from <ingestion-id> --project demo-project --title "Login submit selector guidance" ../memory-qa-demo-workspace
    node packages/cli/dist/index.js approve <draft-id> ../memory-qa-demo-workspace
    node packages/cli/dist/index.js index rebuild ../memory-qa-demo-workspace
    node packages/cli/dist/index.js retrieve --project demo-project --query "login submit selector" ../memory-qa-demo-workspace

This flow uses a local workspace and synthetic input. Review all drafts before approval.

## Testing and quality

    npm run validate:clean
    npm run build

The GitHub Actions workflow validates on Ubuntu with Node.js 22.13.0, 24.x, and 26.x, then audits dependencies.

This clean source tree begins the independently maintained Memory QA project. See the [release process](docs/RELEASING.md) for versioning and release checks.

## Security and privacy

The supported CLI workflow reads and writes local files; it does not upload QA evidence or call an AI provider. Ingestion accepts user-supplied text, which may contain sensitive data. Draft warnings are heuristic and are not a complete secret or personal-data scanner.

Use synthetic data where possible, sanitize authorized evidence, inspect every draft, and keep workspaces outside product and client repositories. See [privacy and safety](docs/PRIVACY-AND-SAFETY.md) and [SECURITY.md](SECURITY.md).

## Contributions

Contributions are welcome under the Apache-2.0 license. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License, Version 2.0](LICENSE.md).

## Maintainer

Steve Westhoek maintains Memory QA.
