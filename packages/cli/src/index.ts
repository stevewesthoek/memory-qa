#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	DomainError,
	addProjectAlias,
	approveDraft,
	createDraftFromIngestion,
	ingestJUnitXml,
	ingestPlainText,
	initializeWorkspace,
	listProjectAliases,
	rebuildMemoryIndex,
	retrieveMemory,
} from "memory-qa-core";

export interface CliIo {
	readonly stdout: (message: string) => void;
	readonly stderr: (message: string) => void;
}

const defaultIo: CliIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

function usage(): string {
	return [
		"Usage:",
		"  memory-qa init [workspace-path]",
		"  memory-qa project add <alias> [workspace-path]",
		"  memory-qa project list [workspace-path]",
		"  memory-qa index rebuild [workspace-path]",
		"  memory-qa ingest <file> --project <alias> [workspace-path]",
		"  memory-qa retrieve --project <alias> --query <text> [workspace-path]",
		"  memory-qa draft create --from <ingestion-id> --project <alias> --title <text> [workspace-path]",
		"  memory-qa approve <draft-id> [workspace-path]",
		"Legacy CLI alias: prochat",
	].join("\n");
}

export async function runCli(
	args: readonly string[] = process.argv.slice(2),
	io: CliIo = defaultIo,
): Promise<number> {
	try {
		const [command, subcommand, value, pathArgument] = args;

		if (command === "--help" || command === "-h") {
			io.stdout(usage());
			return 0;
		}

		if (command === "init") {
			const workspacePath = subcommand ?? process.cwd();
			const config = await initializeWorkspace(workspacePath);
			io.stdout(`Initialized Memory QA at ${config.workspaceRoot}`);
			return 0;
		}

		if (command === "project" && subcommand === "add") {
			if (value === undefined) {
				io.stderr("Missing project alias.\n\n" + usage());
				return 1;
			}

			const config = await initializeWorkspace(pathArgument ?? process.cwd());
			const project = await addProjectAlias(config, value);
			io.stdout(`Added project alias '${project.alias}'.`);
			return 0;
		}

		if (command === "project" && subcommand === "list") {
			const config = await initializeWorkspace(value ?? process.cwd());
			const projects = await listProjectAliases(config);

			if (projects.length === 0) {
				io.stdout("No project aliases configured.");
				return 0;
			}

			for (const project of projects) {
				io.stdout(project.alias);
			}
			return 0;
		}

		if (command === "index" && subcommand === "rebuild") {
			const config = await initializeWorkspace(value ?? process.cwd());
			const result = await rebuildMemoryIndex(config);
			io.stdout(
				`Rebuilt memory index with ${result.indexedFiles} Markdown file${
					result.indexedFiles === 1 ? "" : "s"
				}.`,
			);
			return 0;
		}

		if (command === "ingest") {
			const filePath = subcommand;
			const projectFlag = value;
			const projectAlias = pathArgument;
			const workspacePath = args[4] ?? process.cwd();

			if (
				filePath === undefined ||
				projectFlag !== "--project" ||
				projectAlias === undefined
			) {
				io.stderr("Invalid ingest command.\n\n" + usage());
				return 1;
			}

			const config = await initializeWorkspace(workspacePath);
			const content = await readFile(filePath, "utf8");
			const isJUnitXml = extname(filePath).toLowerCase() === ".xml";
			const stored = isJUnitXml
				? await ingestJUnitXml(config, {
						projectAlias,
						sourceRef: filePath,
						xml: content,
					})
				: await ingestPlainText(config, {
						projectAlias,
						sourceRef: filePath,
						content,
					});
			io.stdout(
				`Ingested ${isJUnitXml ? "JUnit XML" : "plain text"} as '${stored.record.id}'.`,
			);
			return 0;
		}

		if (command === "retrieve") {
			const projectFlag = subcommand;
			const projectAlias = value;
			const queryFlag = pathArgument;
			const query = args[4];
			const workspacePath = args[5] ?? process.cwd();

			if (
				projectFlag !== "--project" ||
				projectAlias === undefined ||
				queryFlag !== "--query" ||
				query === undefined
			) {
				io.stderr("Invalid retrieve command.\n\n" + usage());
				return 1;
			}

			const config = await initializeWorkspace(workspacePath);
			const results = retrieveMemory(config, { projectAlias, query });

			if (results.length === 0) {
				io.stdout("No matching memory found.");
				return 0;
			}

			for (const result of results) {
				io.stdout(
					`${result.memoryId}\t${result.scope}\t${result.status}\t${result.score.toFixed(2)}\t${result.explanation}`,
				);
			}
			return 0;
		}

		if (command === "draft" && subcommand === "create") {
			const fromFlag = value;
			const ingestionId = pathArgument;
			const projectFlag = args[4];
			const projectAlias = args[5];
			const titleFlag = args[6];
			const title = args[7];
			const workspacePath = args[8] ?? process.cwd();

			if (
				fromFlag !== "--from" ||
				ingestionId === undefined ||
				projectFlag !== "--project" ||
				projectAlias === undefined ||
				titleFlag !== "--title" ||
				title === undefined
			) {
				io.stderr("Invalid draft create command.\n\n" + usage());
				return 1;
			}

			const config = await initializeWorkspace(workspacePath);
			const stored = await createDraftFromIngestion(config, {
				ingestionId,
				projectAlias,
				title,
			});
			io.stdout(`Created draft '${stored.draft.id}'.`);
			for (const warning of stored.draft.sanitizationWarnings) {
				io.stdout(`WARNING: ${warning}`);
			}
			return 0;
		}

		if (command === "approve") {
			const draftId = subcommand;
			const workspacePath = value ?? process.cwd();

			if (draftId === undefined) {
				io.stderr("Invalid approve command.\n\n" + usage());
				return 1;
			}

			const config = await initializeWorkspace(workspacePath);
			const result = await approveDraft(config, { draftId });
			io.stdout(`Approved draft '${result.draft.id}'.`);
			io.stdout(`Wrote reviewed memory to ${result.memory.path}`);
			return 0;
		}

		io.stderr(usage());
		return 1;
	} catch (error) {
		if (error instanceof DomainError) {
			io.stderr(`${error.code}: ${error.message}`);
			return 1;
		}

		const message = error instanceof Error ? error.message : String(error);
		io.stderr(`UNEXPECTED_ERROR: ${message}`);
		return 1;
	}
}

const executedFile =
	process.argv[1] === undefined ? "" : resolve(process.argv[1]);
const currentFile = fileURLToPath(import.meta.url);

if (executedFile === currentFile) {
	process.exitCode = await runCli();
}
