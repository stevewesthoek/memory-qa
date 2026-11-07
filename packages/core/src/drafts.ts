import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
	DomainError,
	validateProjectAlias,
	type DraftMemoryUpdate,
	type IngestionRecord,
	type MemoryScope,
	type WorkspaceConfig,
} from "./index.js";
import { isMemoryScope } from "./metadata.js";

export interface CreateDraftFromIngestionInput {
	readonly ingestionId: string;
	readonly projectAlias: string;
	readonly title: string;
	readonly targetScope?: MemoryScope;
}

export interface StoredDraftMemoryUpdate {
	readonly draft: DraftMemoryUpdate;
	readonly path: string;
}

function invalidDraft(message: string, field: string): never {
	throw new DomainError("INVALID_DRAFT", message, { field });
}

function validateIngestionId(value: string): string {
	const normalized = basename(value.trim(), ".json");

	if (
		normalized === "" ||
		normalized === "." ||
		normalized !== value.trim().replace(/\.json$/u, "") ||
		normalized.length > 128
	) {
		invalidDraft("The ingestion identifier is invalid.", "ingestionId");
	}

	return normalized;
}

function validateTitle(value: unknown): string {
	if (typeof value !== "string") {
		invalidDraft("Draft title must be a string.", "title");
	}

	const normalized = value.replaceAll("\r\n", "\n").trim();
	if (
		normalized === "" ||
		normalized.length > 160 ||
		normalized.includes("\n")
	) {
		invalidDraft(
			"Draft title must be a single non-empty line no longer than 160 characters.",
			"title",
		);
	}

	return normalized;
}

function validateBody(value: unknown): string {
	if (typeof value !== "string") {
		invalidDraft("Draft body must be a string.", "body");
	}

	const normalized = value.replaceAll("\r\n", "\n").trim();
	if (normalized === "") {
		invalidDraft("Draft body must not be empty.", "body");
	}

	return normalized;
}

function validateTimestamp(
	value: unknown,
	field: "createdAt" | "approvedAt",
): string {
	if (
		typeof value !== "string" ||
		value.trim() === "" ||
		Number.isNaN(Date.parse(value))
	) {
		invalidDraft(`Draft ${field} must be a valid timestamp.`, field);
	}

	return value;
}

function sanitizationWarnings(record: IngestionRecord): string[] {
	const warnings: string[] = [];
	const evidence = `${record.sourceRef}\n${record.content}`;

	if (
		/\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=]/iu.test(evidence)
	) {
		warnings.push("Evidence may contain credentials or secret material.");
	}
	if (/\b[A-Z]:\\|\/(?:Users|home|private|var|tmp)\//u.test(evidence)) {
		warnings.push("Evidence may contain a local absolute filesystem path.");
	}
	if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(evidence)) {
		warnings.push("Evidence may contain an email address.");
	}

	return warnings;
}

export function validateDraftMemoryUpdate(value: unknown): DraftMemoryUpdate {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		invalidDraft("Draft must be an object.", "draft");
	}

	const draft = value as Record<string, unknown>;
	if (typeof draft["id"] !== "string" || draft["id"].trim() === "") {
		invalidDraft("Draft id must be a non-empty string.", "id");
	}
	if (!isMemoryScope(draft["targetScope"])) {
		invalidDraft("Draft target scope is invalid.", "targetScope");
	}
	if (
		draft["status"] !== "draft" &&
		draft["status"] !== "approved" &&
		draft["status"] !== "rejected"
	) {
		invalidDraft("Draft status is invalid.", "status");
	}

	const projectAlias =
		draft["projectAlias"] === undefined
			? undefined
			: validateProjectAlias(String(draft["projectAlias"]));
	if (draft["targetScope"] === "client-project" && projectAlias === undefined) {
		invalidDraft(
			"Client-project drafts require project provenance.",
			"projectAlias",
		);
	}
	if (
		draft["sourceIngestionId"] !== undefined &&
		(typeof draft["sourceIngestionId"] !== "string" ||
			draft["sourceIngestionId"].trim() === "")
	) {
		invalidDraft(
			"Draft source ingestion id must be a non-empty string.",
			"sourceIngestionId",
		);
	}
	if (
		!Array.isArray(draft["sanitizationWarnings"]) ||
		!draft["sanitizationWarnings"].every(
			(warning) => typeof warning === "string" && warning.trim() !== "",
		)
	) {
		invalidDraft(
			"Draft sanitization warnings must be non-empty strings.",
			"sanitizationWarnings",
		);
	}

	const createdAt = validateTimestamp(draft["createdAt"], "createdAt");
	const approvedAt =
		draft["approvedAt"] === undefined
			? undefined
			: validateTimestamp(draft["approvedAt"], "approvedAt");
	if (draft["status"] === "approved" && approvedAt === undefined) {
		invalidDraft(
			"Approved drafts require an approval timestamp.",
			"approvedAt",
		);
	}
	if (draft["status"] !== "approved" && approvedAt !== undefined) {
		invalidDraft(
			"Only approved drafts may have an approval timestamp.",
			"approvedAt",
		);
	}

	return {
		id: draft["id"],
		...(projectAlias === undefined ? {} : { projectAlias }),
		targetScope: draft["targetScope"],
		...(draft["sourceIngestionId"] === undefined
			? {}
			: { sourceIngestionId: draft["sourceIngestionId"] }),
		title: validateTitle(draft["title"]),
		body: validateBody(draft["body"]),
		status: draft["status"],
		sanitizationWarnings: [...draft["sanitizationWarnings"]],
		createdAt,
		...(approvedAt === undefined ? {} : { approvedAt }),
	};
}

export async function createDraftFromIngestion(
	config: WorkspaceConfig,
	input: CreateDraftFromIngestionInput,
): Promise<StoredDraftMemoryUpdate> {
	const projectAlias = validateProjectAlias(input.projectAlias);
	const ingestionId = validateIngestionId(input.ingestionId);
	const title = validateTitle(input.title);
	const targetScope = input.targetScope ?? "client-project";

	if (!isMemoryScope(targetScope)) {
		invalidDraft(
			`Unsupported draft target scope '${String(targetScope)}'.`,
			"targetScope",
		);
	}

	const ingestionPath = join(
		config.inboxRoot,
		projectAlias,
		`${ingestionId}.json`,
	);
	let record: IngestionRecord;

	try {
		record = JSON.parse(
			await readFile(ingestionPath, "utf8"),
		) as IngestionRecord;
	} catch (error) {
		throw new DomainError(
			"INVALID_DRAFT",
			`Ingestion record '${ingestionId}' was not found for project '${projectAlias}'.`,
			{
				ingestionId,
				projectAlias,
				cause: error instanceof Error ? error.message : String(error),
			},
		);
	}

	if (
		record.id !== ingestionId ||
		record.projectAlias !== projectAlias ||
		typeof record.content !== "string" ||
		record.content.trim() === ""
	) {
		throw new DomainError(
			"INVALID_DRAFT",
			`Ingestion record '${ingestionId}' is invalid or does not belong to project '${projectAlias}'.`,
			{ ingestionId, projectAlias },
		);
	}

	const draft = validateDraftMemoryUpdate({
		id: randomUUID(),
		projectAlias: record.projectAlias,
		targetScope,
		sourceIngestionId: record.id,
		title,
		body: record.content,
		status: "draft",
		sanitizationWarnings: sanitizationWarnings(record),
		createdAt: new Date().toISOString(),
	});
	const directory = join(config.draftsRoot, projectAlias);
	const path = join(directory, `${draft.id}.json`);

	await mkdir(directory, { recursive: true });
	await writeFile(path, `${JSON.stringify(draft, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx",
	});

	return { draft, path };
}
