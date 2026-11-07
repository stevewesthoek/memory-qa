# Memory QA Quickstart

This workflow uses the fictional login failure fixture in this repository. Do not replace it with client or customer data.

## Build and initialize

Use a new sibling directory for workspace data so it stays outside this source checkout. If the example path already contains data, choose another empty sibling directory.

    npm ci --ignore-scripts
    npm run build
    node packages/cli/dist/index.js init ../memory-qa-demo-workspace
    node packages/cli/dist/index.js project add demo-project ../memory-qa-demo-workspace

## Ingest and retrieve

    node packages/cli/dist/index.js ingest ./demo/login-selector-failure/raw-log.txt.md --project demo-project ../memory-qa-demo-workspace
    node packages/cli/dist/index.js index rebuild ../memory-qa-demo-workspace
    node packages/cli/dist/index.js retrieve --project demo-project --query "login submit selector" ../memory-qa-demo-workspace

The new workspace has no reviewed memories yet, so retrieval may return no result. The ingest command prints an ID. Use it to create a draft:

    node packages/cli/dist/index.js draft create --from <ingestion-id> --project demo-project --title "Login submit selector guidance" ../memory-qa-demo-workspace

Open the draft under ../memory-qa-demo-workspace/drafts/demo-project. Review the evidence, remove sensitive details, and keep only a reusable engineering lesson. Then use the draft ID printed by the command:

    node packages/cli/dist/index.js approve <draft-id> ../memory-qa-demo-workspace
    node packages/cli/dist/index.js index rebuild ../memory-qa-demo-workspace
    node packages/cli/dist/index.js retrieve --project demo-project --query "login submit selector" ../memory-qa-demo-workspace

## Compatibility

The prochat command and .prochat metadata directory are retained for existing beta workspaces.

## Validate the checkout

    npm run validate:clean
