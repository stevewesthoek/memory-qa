import { basename, join } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";

import {
	DomainError,
	storeReviewedMemory,
	validateDraftMemoryUpdate,
	type DraftMemoryUpdate,
	type StoredMemoryEntry,
	type WorkspaceConfig,
} from "./index.js";
import { parseMemoryMarkdown } from "./markdown.js";
import { MemoryRepositoryError } from "./memory-repository.js";
import { validateMemoryMetadata } from "./metadata.js";

export interface ApproveDraftInput {
	readonly draftId: string;
}

export interface ApproveDraftDependencies {
	readonly writeDraftFile?: (path: string, content: string) => Promise<void>;
}

export interface ApprovedDraftResult {
	readonly draft: DraftMemoryUpdate;
	readonly draftPath: string;
	readonly memory: StoredMemoryEntry;
}

function validateDraftId(value: string): string {
	const trimmed = value.trim();
	const normalized = basename(trimmed, ".json");

	if (
		normalized === "" ||
		normalized === "." ||
		normalized !== trimmed.replace(/\.json$/u, "") ||
		normalized.length > 128
	) {
		throw new DomainError("INVALID_DRAFT", "The draft identifier is invalid.", {
			field: "draftId",
		});
	}

	return normalized;
}

async function findDraftPath(
	config: WorkspaceConfig,
	draftId: string,
): Promise<string> {
	const projects = await readdir(config.draftsRoot, { withFileTypes: true });
	const matches: string[] = [];

	for (const project of projects) {
		if (!project.isDirectory()) {
			continue;
		}

		const path = join(config.draftsRoot, project.name, `${draftId}.json`);
		try {
			await readFile(path, "utf8");
			matches.push(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	}

	if (matches.length === 0) {
		throw new DomainError(
			"INVALID_DRAFT",
			`Draft '${draftId}' was not found.`,
			{ draftId },
		);
	}
	if (matches.length > 1) {
		throw new DomainError(
			"INVALID_DRAFT",
			`Draft '${draftId}' is ambiguous across project directories.`,
			{ draftId, matches },
		);
	}

	return matches[0] as string;
}

async function storeReviewedMemoryIdempotently(
	config: WorkspaceConfig,
	metadataInput: unknown,
	body: string,
): Promise<StoredMemoryEntry> {
	const metadata = validateMemoryMetadata(metadataInput);
	const normalizedBody = body.trim();

	try {
		return await storeReviewedMemory(config, metadataInput, body);
	} catch (error) {
		if (
			!(error instanceof MemoryRepositoryError) ||
			error.code !== "MEMORY_ALREADY_EXISTS" ||
			error.path === undefined
		) {
			throw error;
		}

		const existing = parseMemoryMarkdown(await readFile(error.path, "utf8"));
		const matchesPendingApproval =
			existing.metadata.id === metadata.id &&
			existing.metadata.scope === metadata.scope &&
			existing.metadata.status === "reviewed" &&
			existing.metadata.projectAlias === metadata.projectAlias &&
			existing.metadata.sourceRef === metadata.sourceRef &&
			existing.metadata.name === metadata.name &&
			existing.body.trim() === normalizedBody;

		if (!matchesPendingApproval) {
			throw error;
		}

		return {
			metadata: existing.metadata,
			body: normalizedBody,
			path: error.path,
		};
	}
}

export async function approveDraft(
	config: WorkspaceConfig,
	input: ApproveDraftInput,
	dependencies: ApproveDraftDependencies = {},
): Promise<ApprovedDraftResult> {
	const draftId = validateDraftId(input.draftId);
	const draftPath = await findDraftPath(config, draftId);
	let draft: DraftMemoryUpdate;

	try {
		draft = validateDraftMemoryUpdate(
			JSON.parse(await readFile(draftPath, "utf8")) as unknown,
		);
	} catch (error) {
		if (error instanceof DomainError) {
			throw error;
		}

		throw new DomainError(
			"INVALID_DRAFT",
			`Draft '${draftId}' could not be loaded or parsed.`,
			{
				draftId,
				cause: error instanceof Error ? error.message : String(error),
			},
		);
	}

	if (draft.id !== draftId) {
		throw new DomainError(
			"INVALID_DRAFT",
			`Draft '${draftId}' has mismatched persisted metadata.`,
			{ draftId, persistedId: draft.id },
		);
	}
	if (draft.status === "rejected") {
		throw new DomainError(
			"APPROVAL_REQUIRED",
			`Rejected draft '${draftId}' cannot be approved.`,
			{ draftId },
		);
	}
	if (draft.status === "approved") {
		throw new DomainError(
			"APPROVAL_REQUIRED",
			`Draft '${draftId}' is already approved.`,
			{ draftId },
		);
	}
	if (draft.sanitizationWarnings.length > 0) {
		throw new DomainError(
			"APPROVAL_REQUIRED",
			`Draft '${draftId}' has unresolved sanitization warnings.`,
			{ draftId, warnings: draft.sanitizationWarnings },
		);
	}

	const approvedAt = new Date().toISOString();
	const memoryInput = {
		id: draft.id,
		scope: draft.targetScope,
		status: "reviewed",
		created: draft.createdAt.slice(0, 10),
		last_reviewed: approvedAt.slice(0, 10),
		source_ref:
			draft.sourceIngestionId === undefined
				? `draft:${draft.id}`
				: `ingestion:${draft.sourceIngestionId}`,
		name: draft.title,
		...(draft.projectAlias === undefined
			? {}
			: { project: draft.projectAlias }),
	};
	const memory = await storeReviewedMemoryIdempotently(
		config,
		memoryInput,
		draft.body,
	);

	const approvedDraft = validateDraftMemoryUpdate({
		...draft,
		status: "approved",
		approvedAt,
	});
	const approvedDraftContent = `${JSON.stringify(approvedDraft, null, 2)}\n`;
	const writeDraftFile =
		dependencies.writeDraftFile ??
		((path: string, content: string) =>
			writeFile(path, content, { encoding: "utf8", flag: "w" }));

	await writeDraftFile(draftPath, approvedDraftContent);

	return {
		draft: approvedDraft,
		draftPath,
		memory,
	};
}
