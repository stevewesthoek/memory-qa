# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Select **Security** → **Report a vulnerability** to send a private report to the maintainer. Do not use a public issue for vulnerability details.

Do not put vulnerability details, credentials, private QA memory, customer information, or confidential logs in a public issue.

## Data handling

The CLI, core, and MCP tool layer operate on local files. They do not call an AI provider or hosted service. Users can still ingest arbitrary text, including information the project should not receive. The draft warning checks are heuristic and do not guarantee detection of secrets or personal information.

Use synthetic evidence for demonstrations and bug reports. If sensitive material is encountered, stop processing it and follow the applicable organization or client incident process.

## Supported versions

No independent Memory QA release has been published. The 0.1.0 package version belongs to the earlier ProChat beta source and does not establish a current support commitment.

Include the affected version, impact, and steps to reproduce. Use synthetic data and remove credentials, private QA memory, customer information, and confidential logs. The maintainer will review reports and coordinate any fix or disclosure; there is no response-time guarantee.
