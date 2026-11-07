# Contributing

Contributions are welcome under the Apache-2.0 license. This repository does not currently require a separate contributor agreement. Contributions submitted for inclusion are handled under Section 5 of the license unless clearly marked otherwise.

## Before opening an issue or pull request

- Use fictional or thoroughly sanitized examples. Do not include customer names, personal information, credentials, private URLs, proprietary logs, or client source code.
- Check that the change fits Memory QA's purpose: retaining and retrieving human-reviewed QA investigation knowledge.
- Open an issue first for a change that alters the storage format, project isolation, or command behavior.

## Pull requests

1. Create a focused branch and describe the user-visible behavior change.
2. Add or update deterministic tests for code changes.
3. Run `npm ci --ignore-scripts`, `npm run validate:clean`, and `npm run build`.
4. Explain compatibility impact, migration needs, and privacy consequences.
5. Keep generated build output, local workspaces, and real QA evidence out of commits.

The maintainer may ask for changes or decline work that includes material without clear redistribution rights or that could expose confidential information.

## Engineering scope

Contributions should improve local-first storage, retrieval, project boundaries, human review, diagnostics, tests, documentation, or developer experience. Memory QA is a software quality engineering tool; it is not an AI model training or benchmarking platform.
