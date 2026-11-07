# Engineering backlog

This is a proposed backlog based on current source behavior. It is not a commitment to ship features. Start work only after publication, contribution, and rights gates are resolved.

## P1 — Make workspace storage policy explicit

**Problem:** Users can initialize a workspace anywhere, and approved Markdown memory plus workspace metadata remain ordinary files. A workspace created inside a product or client repository can therefore be committed if the user does not choose an appropriate version-control policy.

**Evidence:** packages/core/src/workspace.ts accepts an arbitrary path. Its generated ignore file excludes the index, inbox, and drafts, while leaving approved memory and project metadata available for intentional version control. The README and privacy guide advise keeping workspaces outside product and client repositories. The quickstart now uses a sibling directory.

**Outcome:** Users can tell which workspace files may be committed and choose between a private local workspace and deliberately version-controlled reviewed knowledge.

**Acceptance criteria:** Document both storage choices and their consequences; keep the quickstart outside the software checkout; state which generated workspace files are ignored and which remain eligible for version control; preserve existing workspace contents during any future migration.

**Test strategy:** Use a disposable synthetic workspace and git check-ignore to verify the documented default; test that initialization and migration preserve existing Markdown, metadata, drafts, and project aliases.

**Complexity estimate:** Small to medium.

**Relevant code locations:** packages/core/src/workspace.ts; packages/core/test/workspace.test.ts; README.md; QUICKSTART.md; docs/PRIVACY-AND-SAFETY.md.

## P1 — Verify supported operating systems

**Problem:** The project has no evidence-based operating-system support statement.

**Evidence:** .github/workflows/ci.yml runs on Ubuntu with Node.js 22.16.0, 24.x, and 26.x. Local validation has been performed on macOS. The workflow has not been run on Windows.

**Outcome:** Documentation names only operating systems and Node.js versions that pass the complete workflow.

**Acceptance criteria:** Run install, build, typecheck, lint, tests, CLI workflow, SQLite operations, path handling, and cleanup on macOS, Linux, and Windows; publish the tested matrix without implying support for untested configurations.

**Test strategy:** Extend CI after a platform passes locally; run the synthetic CLI workflow and complete validation on each matrix entry.

**Complexity estimate:** Medium.

**Relevant code locations:** .github/workflows/ci.yml; packages/core/src/sqlite-index.ts; packages/core/src/workspace.ts; packages/cli/test/workflow.integration.test.ts.

## P1 — Measure retrieval quality on a synthetic corpus

**Problem:** Retrieval ranking has no corpus-level relevance baseline.

**Evidence:** packages/core/src/retrieval.ts tokenizes queries and uses SQLite FTS5 matching with status boosts. Existing tests cover basic matching, scope filtering, and ordering, but not a labeled corpus with representative query difficulty.

**Outcome:** Retrieval changes can be compared against deterministic expectations without claiming semantic search.

**Acceptance criteria:** Add fictional failures, projects, and lessons; define expected relevant results for exact, paraphrased, sparse, and noisy queries; report a simple metric such as precision at five or recall at five; preserve project isolation and explain known ranking limits.

**Test strategy:** Add local tests for expected hits and ordering, project-scope isolation, and exclusion of deprecated memories. Keep the corpus synthetic and deterministic.

**Complexity estimate:** Medium.

**Relevant code locations:** packages/core/src/retrieval.ts; packages/core/src/sqlite-index.ts; packages/core/test/retrieval.test.ts; packages/core/test/sqlite-rebuild.test.ts.

## P1 — Expand and clarify sanitization warnings

**Problem:** Draft warnings cover only a small set of sensitive-looking patterns and cannot establish that a draft is safe.

**Evidence:** packages/core/src/drafts.ts checks credential-like key/value text, selected local absolute paths, and email addresses. The checks can miss sensitive content and can flag harmless text; they are advisory.

**Outcome:** Warning categories and limits are documented and covered by synthetic tests, without turning the feature into a false guarantee or DLP claim.

**Acceptance criteria:** Define supported categories and false-positive boundaries; never print matched values; preserve the warning-only, human-review flow; document that detection is incomplete in CLI and privacy guidance.

**Test strategy:** Unit-test positive and negative examples for each supported category; inspect generated draft warnings and CLI output to confirm that matched values are not exposed.

**Complexity estimate:** Medium.

**Relevant code locations:** packages/core/src/drafts.ts; packages/core/test/drafts.test.ts; packages/cli/src/index.ts; packages/cli/test/cli.test.ts; docs/PRIVACY-AND-SAFETY.md.

## P2 — Make repeated ingestion explainable

**Problem:** Re-ingesting the same report can create separate ingestion records and drafts without a duplicate-content signal.

**Evidence:** packages/core/src/ingestion.ts assigns unique record identifiers, and packages/core/src/drafts.ts creates drafts from a selected ingestion. No duplicate-warning behavior is exposed in the current CLI workflow.

**Outcome:** Users can recognize likely repeated input while retaining control over whether separate runs should both be kept.

**Acceptance criteria:** Choose and document whether comparison uses exact or normalized content; show scope and source provenance; never silently discard an ingestion; do not persist raw content hashes outside the local workspace.

**Test strategy:** Use synthetic identical and near-identical reports within one project and across projects; verify that warnings do not leak cross-project information and that no data is automatically deleted.

**Complexity estimate:** Medium.

**Relevant code locations:** packages/core/src/ingestion.ts; packages/core/src/retrieval.ts; packages/core/src/memory-repository.ts; packages/core/test/ingestion.test.ts; packages/core/test/memory-repository.test.ts; packages/cli/src/index.ts.

## P2 — Clarify the MCP integration contract

**Problem:** The MCP package exposes tool definitions but does not provide a transport or standalone server, which can be mistaken for a complete MCP integration.

**Evidence:** packages/mcp/src/index.ts builds local tool definitions over core operations. packages/mcp/test/mcp-tools.test.ts validates definitions, while transport setup belongs to a host.

**Outcome:** Developers understand the exact host responsibility and can make an informed decision about using the adapter.

**Acceptance criteria:** Document supported MCP SDK/host assumptions only when verified; state which process can read and write the workspace; provide a complete runnable local example only if it can be tested with a real compatible host; otherwise keep the package explicitly definitions-only. Do not add a placeholder server.

**Test strategy:** Keep tool-contract tests; if a host example is added, run it with synthetic data in a disposable workspace and verify scope, file writes, errors, and shutdown behavior.

**Complexity estimate:** Medium.

**Relevant code locations:** packages/mcp/src/index.ts; packages/mcp/test/mcp-tools.test.ts; packages/core/src/workspace.ts; docs/ARCHITECTURE.md; docs/PRIVACY-AND-SAFETY.md.

## P2 — Define support and compatibility policy

**Problem:** The project does not yet state how long it will support beta workspace metadata and the former CLI alias.

**Evidence:** package.json declares Node.js >=22.16.0. packages/cli/package.json retains the prochat command alias, and packages/core/src/workspace.ts uses the .prochat metadata directory. These names exist for prior beta workspaces.

**Outcome:** Users know tested runtimes and how compatibility changes will affect existing workspaces.

**Acceptance criteria:** Declare tested Node.js versions; set a deprecation policy for the prochat alias and .prochat metadata; provide a migration path before removing either; do not promise compatibility beyond tested fixtures.

**Test strategy:** Add compatibility tests using a copied synthetic beta workspace; verify that migration is explicit, repeatable, and recoverable.

**Complexity estimate:** Small to medium.

**Relevant code locations:** package.json; packages/cli/package.json; packages/cli/src/index.ts; packages/core/src/workspace.ts; packages/core/test/workspace.test.ts; packages/cli/test/workflow.integration.test.ts.
