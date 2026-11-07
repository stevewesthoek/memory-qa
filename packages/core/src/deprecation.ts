import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	DomainError,
	parseMemoryMarkdown,
	serializeMemoryMarkdown,
	type WorkspaceConfig,
} from "./index.js";

export interface DeprecateMemoryInput {
	readonly memoryId: string;
}

export interface DeprecatedMemoryResult {
	readonly memoryId: string;
	readonly path: string;
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listMarkdownFiles(path)));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(path);
		}
	}

	return files;
}

export async function deprecateMemory(
	config: WorkspaceConfig,
	input: DeprecateMemoryInput,
): Promise<DeprecatedMemoryResult> {
	const memoryId = input.memoryId.trim();
	if (memoryId === "" || memoryId.includes("/") || memoryId.includes("\\")) {
		throw new DomainError(
			"INVALID_MEMORY_STATUS",
			"The memory identifier is invalid.",
			{
				field: "memoryId",
			},
		);
	}

	const matches: Array<{ path: string; source: string }> = [];
	for (const path of await listMarkdownFiles(config.memoryRoot)) {
		const source = await readFile(path, "utf8");
		const parsed = parseMemoryMarkdown(source);
		if (parsed.metadata.id === memoryId) {
			matches.push({ path, source });
		}
	}

	if (matches.length === 0) {
		throw new DomainError(
			"INVALID_MEMORY_STATUS",
			`Memory '${memoryId}' was not found.`,
			{ memoryId },
		);
	}
	if (matches.length > 1) {
		throw new DomainError(
			"INVALID_MEMORY_STATUS",
			`Memory '${memoryId}' is ambiguous across the repository.`,
			{ memoryId, matches: matches.map((match) => match.path) },
		);
	}

	const match = matches[0] as { path: string; source: string };
	const parsed = parseMemoryMarkdown(match.source);
	if (parsed.metadata.status === "deprecated") {
		throw new DomainError(
			"INVALID_MEMORY_STATUS",
			`Memory '${memoryId}' is already deprecated.`,
			{ memoryId },
		);
	}
	if (
		parsed.metadata.status !== "reviewed" &&
		parsed.metadata.status !== "trusted"
	) {
		throw new DomainError(
			"INVALID_MEMORY_STATUS",
			`Only reviewed or trusted memory can be deprecated.`,
			{ memoryId, status: parsed.metadata.status },
		);
	}

	const deprecatedSource = serializeMemoryMarkdown(
		{
			id: parsed.metadata.id,
			scope: parsed.metadata.scope,
			status: "reviewed",
			created: parsed.metadata.created,
			source_ref: parsed.metadata.sourceRef,
			...(parsed.metadata.name === undefined
				? {}
				: { name: parsed.metadata.name }),
			...(parsed.metadata.projectAlias === undefined
				? {}
				: { project: parsed.metadata.projectAlias }),
			...(parsed.metadata.lastReviewed === undefined
				? {}
				: { last_reviewed: parsed.metadata.lastReviewed }),
		},
		parsed.body,
	).replace("status: reviewed", "status: deprecated");

	await writeFile(match.path, deprecatedSource, {
		encoding: "utf8",
		flag: "w",
	});

	return { memoryId, path: match.path };
}
