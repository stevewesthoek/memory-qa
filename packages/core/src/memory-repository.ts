import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspaceConfig } from "./index.js";
import {
	validateMemoryMetadata,
	type MemoryEntryMetadata,
} from "./metadata.js";

export type MemoryRepositoryErrorCode =
	| "MEMORY_NOT_REVIEWED"
	| "EMPTY_MEMORY_BODY"
	| "MEMORY_ALREADY_EXISTS";

export class MemoryRepositoryError extends Error {
	public readonly code: MemoryRepositoryErrorCode;
	public readonly path: string | undefined;

	public constructor(
		code: MemoryRepositoryErrorCode,
		message: string,
		path?: string,
	) {
		super(message);
		this.name = "MemoryRepositoryError";
		this.code = code;
		this.path = path;
	}
}

export interface StoredMemoryEntry {
	metadata: MemoryEntryMetadata;
	body: string;
	path: string;
}

function quoteFrontmatterValue(value: string): string {
	if (/^[a-zA-Z0-9._/-]+$/.test(value)) {
		return value;
	}

	return JSON.stringify(value);
}

export function serializeMemoryMarkdown(
	metadataInput: unknown,
	bodyInput: string,
): string {
	const metadata = validateMemoryMetadata(metadataInput);
	const body = bodyInput.trim();

	if (metadata.status !== "reviewed") {
		throw new MemoryRepositoryError(
			"MEMORY_NOT_REVIEWED",
			"Only reviewed memory can be stored in the durable Markdown repository.",
		);
	}

	if (body === "") {
		throw new MemoryRepositoryError(
			"EMPTY_MEMORY_BODY",
			"Reviewed memory must contain a non-empty Markdown body.",
		);
	}

	const frontmatter = [
		`id: ${quoteFrontmatterValue(metadata.id)}`,
		`scope: ${quoteFrontmatterValue(metadata.scope)}`,
		`status: ${quoteFrontmatterValue(metadata.status)}`,
		`created: ${quoteFrontmatterValue(metadata.created)}`,
		`source_ref: ${quoteFrontmatterValue(metadata.sourceRef)}`,
	];

	if (metadata.name !== undefined) {
		frontmatter.push(`name: ${quoteFrontmatterValue(metadata.name)}`);
	}
	if (metadata.projectAlias !== undefined) {
		frontmatter.push(
			`project: ${quoteFrontmatterValue(metadata.projectAlias)}`,
		);
	}
	if (metadata.lastReviewed !== undefined) {
		frontmatter.push(
			`last_reviewed: ${quoteFrontmatterValue(metadata.lastReviewed)}`,
		);
	}

	return `---\n${frontmatter.join("\n")}\n---\n\n${body}\n`;
}

export async function storeReviewedMemory(
	config: WorkspaceConfig,
	metadataInput: unknown,
	body: string,
): Promise<StoredMemoryEntry> {
	const metadata = validateMemoryMetadata(metadataInput);
	const content = serializeMemoryMarkdown(metadataInput, body);
	const directory =
		metadata.projectAlias === undefined
			? join(config.memoryRoot, metadata.scope)
			: join(config.memoryRoot, metadata.scope, metadata.projectAlias);
	const path = join(directory, `${metadata.id}.md`);

	await mkdir(directory, { recursive: true });

	try {
		await writeFile(path, content, { encoding: "utf8", flag: "wx" });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new MemoryRepositoryError(
				"MEMORY_ALREADY_EXISTS",
				`Memory '${metadata.id}' already exists at ${path}.`,
				path,
			);
		}

		throw error;
	}

	return {
		metadata,
		body: body.trim(),
		path,
	};
}
