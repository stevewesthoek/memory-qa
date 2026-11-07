import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
	DomainError,
	listProjectAliases,
	validateProjectAlias,
	type IngestionRecord,
	type WorkspaceConfig,
} from "./index.js";

export interface PlainTextIngestionInput {
	readonly projectAlias: string;
	readonly sourceRef: string;
	readonly content: string;
}

export interface StoredIngestionRecord {
	readonly record: IngestionRecord;
	readonly path: string;
}

function normalizeSourceRef(sourceRef: string): string {
	const normalized = basename(sourceRef.trim());

	if (normalized === "" || normalized === "." || normalized.length > 256) {
		throw new DomainError(
			"INVALID_INGESTION_INPUT",
			"The ingestion source reference must be a non-empty file name no longer than 256 characters.",
			{ field: "sourceRef" },
		);
	}

	return normalized;
}

export async function ingestPlainText(
	config: WorkspaceConfig,
	input: PlainTextIngestionInput,
): Promise<StoredIngestionRecord> {
	const projectAlias = validateProjectAlias(input.projectAlias);
	const projects = await listProjectAliases(config);

	if (!projects.some((project) => project.alias === projectAlias)) {
		throw new DomainError(
			"PROJECT_ALIAS_NOT_FOUND",
			`Project alias '${projectAlias}' is not configured.`,
			{ projectAlias },
		);
	}

	const content = input.content.replaceAll("\r\n", "\n").trim();
	if (content === "") {
		throw new DomainError(
			"INVALID_INGESTION_INPUT",
			"Plain-text ingestion content must not be empty.",
			{ field: "content" },
		);
	}

	const record: IngestionRecord = {
		id: randomUUID(),
		projectAlias,
		sourceType: "plain-text",
		sourceRef: normalizeSourceRef(input.sourceRef),
		content,
		createdAt: new Date().toISOString(),
	};
	const directory = join(config.inboxRoot, projectAlias);
	const path = join(directory, `${record.id}.json`);

	await mkdir(directory, { recursive: true });
	await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx",
	});

	return { record, path };
}
