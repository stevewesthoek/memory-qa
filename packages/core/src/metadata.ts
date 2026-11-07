import type { MemoryScope, MemoryStatus } from "./index.js";

const MEMORY_SCOPES: readonly MemoryScope[] = [
	"personal",
	"client-project",
	"cross-project",
	"company-approved",
];

const MEMORY_STATUSES: readonly MemoryStatus[] = [
	"raw",
	"draft",
	"reviewed",
	"trusted",
	"deprecated",
];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface MemoryEntryMetadata {
	id: string;
	scope: MemoryScope;
	status: MemoryStatus;
	created: string;
	sourceRef: string;
	name?: string;
	projectAlias?: string;
	lastReviewed?: string;
}

export type MemoryMetadataErrorCode =
	| "INVALID_MEMORY_ID"
	| "INVALID_MEMORY_SCOPE"
	| "INVALID_MEMORY_STATUS"
	| "INVALID_MEMORY_DATE"
	| "INVALID_SOURCE_REF"
	| "INVALID_MEMORY_METADATA";

export class MemoryMetadataError extends Error {
	public readonly code: MemoryMetadataErrorCode;
	public readonly field: string | undefined;

	public constructor(
		code: MemoryMetadataErrorCode,
		message: string,
		field?: string,
	) {
		super(message);
		this.name = "MemoryMetadataError";
		this.code = code;
		this.field = field;
	}
}

export function isMemoryScope(value: unknown): value is MemoryScope {
	return (
		typeof value === "string" && MEMORY_SCOPES.includes(value as MemoryScope)
	);
}

export function isMemoryStatus(value: unknown): value is MemoryStatus {
	return (
		typeof value === "string" && MEMORY_STATUSES.includes(value as MemoryStatus)
	);
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new MemoryMetadataError(
			"INVALID_MEMORY_METADATA",
			"Memory metadata must be an object.",
		);
	}

	return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string): string {
	const value = record[field];

	if (typeof value !== "string" || value.trim() === "") {
		throw new MemoryMetadataError(
			"INVALID_MEMORY_METADATA",
			`Memory metadata field '${field}' must be a non-empty string.`,
			field,
		);
	}

	return value.trim();
}

function optionalString(
	record: Record<string, unknown>,
	field: string,
): string | undefined {
	const value = record[field];

	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "string" || value.trim() === "") {
		throw new MemoryMetadataError(
			"INVALID_MEMORY_METADATA",
			`Memory metadata field '${field}' must be a non-empty string when provided.`,
			field,
		);
	}

	return value.trim();
}

function validateDate(value: string, field: string): string {
	if (
		!DATE_PATTERN.test(value) ||
		Number.isNaN(Date.parse(`${value}T00:00:00Z`))
	) {
		throw new MemoryMetadataError(
			"INVALID_MEMORY_DATE",
			`Memory metadata field '${field}' must use YYYY-MM-DD format.`,
			field,
		);
	}

	return value;
}

export function validateMemoryMetadata(input: unknown): MemoryEntryMetadata {
	const record = requireRecord(input);
	const id = requireString(record, "id");
	const scope = record["scope"];
	const status = record["status"];
	const created = requireString(record, "created");
	const sourceRef = requireString(record, "source_ref");
	const name = optionalString(record, "name");
	const projectAlias = optionalString(record, "project");
	const lastReviewed = optionalString(record, "last_reviewed");

	if (!SLUG_PATTERN.test(id) || id.length > 128) {
		throw new MemoryMetadataError(
			"INVALID_MEMORY_ID",
			"Memory id must use lowercase letters, numbers, and single hyphens, with a maximum length of 128 characters.",
			"id",
		);
	}

	if (!isMemoryScope(scope)) {
		throw new MemoryMetadataError(
			"INVALID_MEMORY_SCOPE",
			"Memory scope must be personal, client-project, cross-project, or company-approved.",
			"scope",
		);
	}

	if (!isMemoryStatus(status)) {
		throw new MemoryMetadataError(
			"INVALID_MEMORY_STATUS",
			"Memory status must be raw, draft, reviewed, trusted, or deprecated.",
			"status",
		);
	}

	if (sourceRef.length > 256) {
		throw new MemoryMetadataError(
			"INVALID_SOURCE_REF",
			"Memory source_ref must not exceed 256 characters.",
			"source_ref",
		);
	}

	const metadata: MemoryEntryMetadata = {
		id,
		scope,
		status,
		created: validateDate(created, "created"),
		sourceRef,
	};

	if (name !== undefined) {
		metadata.name = name;
	}
	if (projectAlias !== undefined) {
		metadata.projectAlias = projectAlias;
	}
	if (lastReviewed !== undefined) {
		metadata.lastReviewed = validateDate(lastReviewed, "last_reviewed");
	}

	return metadata;
}
