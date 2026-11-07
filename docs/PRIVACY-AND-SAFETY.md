# Privacy and safety

## Local data behavior

The CLI and core read and write the local workspace. The MCP package exposes local tools to a host-provided transport. These packages do not upload QA evidence, synchronize to a cloud service, or call a model provider.

Dependency installation and updates contact package registries. That development activity is separate from runtime handling of a user's workspace.

## Input responsibility

Plain-text and JUnit ingestion accept user-supplied content. Logs and test reports can contain credentials, personal information, customer data, private URLs, source excerpts, and confidential identifiers. Do not ingest data unless its processing is authorized.

Use the synthetic examples in this repository. Before using other evidence, remove or replace sensitive content and confirm the right project workspace.

## Warning limitations

Draft creation currently checks for credential-like strings, local absolute paths, and email addresses. These checks are heuristic. They can miss sensitive data and may flag harmless text. They are not a full personal-data detector, secret scanner, or substitute for human review.

Inspect each draft before approval. Do not rely on the warning list as proof that a file is safe.

## Project and scope separation

Client-project retrieval filters by project alias. Personal, cross-project, and company-approved scopes have broader visibility by design. Use only scopes that are authorized for the content and keep unrelated clients in separate workspaces when required.

Memory QA does not replace filesystem permissions, client agreements, retention rules, or organizational access controls.

## Durable and generated files

Markdown is the durable memory source. SQLite is a local generated index. The workspace also contains project metadata, ingestions, and drafts. Keep the workspace outside product and client repositories unless a deliberate storage policy says otherwise.

Do not commit local workspaces, real customer data, or production QA logs to the software repository.

## Examples and reports

Repository examples use synthetic FakeShop/login scenarios. Public bug reports must also use synthetic or thoroughly sanitized examples. Report vulnerabilities through the private channel described in SECURITY.md, not a public issue.
