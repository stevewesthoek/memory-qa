# Release process

This repository is the standalone Memory QA source project. It starts a clean Git history; historical ProChat beta tags and commits are not included or represented as Memory QA releases.

## Current status

- The package workspaces are at version `0.1.0`. That value was inherited from the earlier ProChat beta metadata; it does not claim an earlier independent Memory QA release.
- The clean repository has not created an independent release tag yet.
- The repository contains source and development tooling. No npm publication workflow is configured, and package publishing is outside this process.

## Source changes

1. Use a focused pull request with a synthetic reproduction and tests for behavior changes.
2. Keep customer data, credentials, private URLs, and confidential QA evidence out of issues, commits, and pull requests.
3. Run `npm ci --ignore-scripts`, `npm run validate:clean`, `npm run build`, and `npm audit --audit-level=low`.
4. Check the README commands and the synthetic workflow from workspace initialization through reviewed-memory retrieval.
5. Merge only after the GitHub Actions checks pass. The CI matrix covers Ubuntu with Node.js 22.16.0, 24.x, and 26.x.

## Versioned releases

For a source release, update the root and workspace package versions, `VERSION.md`, and `CHANGELOG.md` together. Use semantic versioning for the public project. Create a release tag only for the reviewed public commit after CI passes. Do not reuse the historical ProChat beta tag.

Review the exact tag tree for generated output, local workspaces, internal preparation files, and third-party notices. Verify the public commit, tag target, license, README rendering, and documented installation commands after publishing release notes.

## Package distribution

The package manifests remain private to prevent accidental npm publication. Publishing packages would require a separate package-scope, ownership, namespace, artifact, dependency-notice, and automation review; this repository does not configure that workflow.

## Rollback and corrections

Before a release tag is created, fix the candidate with ordinary commits. After publication, correct issues with new commits and a new version as appropriate. A visibility reversal cannot retract clones or license grants. Keep the private historical source archive and the obsolete generated repository until replacement links and external dependencies have been checked; archive the generated repository only after the replacement is verified.
