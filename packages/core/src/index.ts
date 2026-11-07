export type MemoryScope =
	| "personal"
	| "client-project"
	| "cross-project"
	| "company-approved";

export type MemoryStatus =
	| "raw"
	| "draft"
	| "reviewed"
	| "trusted"
	| "deprecated";

export interface WorkspaceConfig {
	version: 1;
	workspaceRoot: string;
	projectsFile: string;
	memoryRoot: string;
	inboxRoot: string;
	draftsRoot: string;
	indexFile: string;
}

export interface ProjectAlias {
	alias: string;
	displayName?: string;
	description?: string;
	createdAt: string;
}

export interface IngestionRecord {
	id: string;
	projectAlias: string;
	sourceType: "plain-text" | "junit-xml";
	sourceRef: string;
	content: string;
	createdAt: string;
}

export interface RetrievalResult {
	memoryId: string;
	projectAlias?: string;
	scope: MemoryScope;
	status: MemoryStatus;
	sourcePath: string;
	score: number;
	matchedTerms: string[];
	explanation: string;
	lastReviewed?: string;
}

export interface DraftMemoryUpdate {
	id: string;
	projectAlias?: string;
	targetScope: MemoryScope;
	sourceIngestionId?: string;
	title: string;
	body: string;
	status: "draft" | "approved" | "rejected";
	sanitizationWarnings: string[];
	createdAt: string;
	approvedAt?: string;
}

export type DomainErrorCode =
	| "WORKSPACE_ALREADY_EXISTS"
	| "WORKSPACE_NOT_FOUND"
	| "INVALID_WORKSPACE_CONFIG"
	| "INVALID_PROJECT_ALIAS"
	| "PROJECT_ALIAS_ALREADY_EXISTS"
	| "PROJECT_ALIAS_NOT_FOUND"
	| "INVALID_MEMORY_SCOPE"
	| "INVALID_MEMORY_STATUS"
	| "INVALID_INGESTION_INPUT"
	| "INVALID_DRAFT"
	| "APPROVAL_REQUIRED";

export class DomainError extends Error {
	public readonly code: DomainErrorCode;
	public readonly details: Readonly<Record<string, unknown>> | undefined;

	public constructor(
		code: DomainErrorCode,
		message: string,
		details?: Readonly<Record<string, unknown>>,
	) {
		super(message);
		this.name = "DomainError";
		this.code = code;
		this.details = details;
	}
}

export class WorkspaceError extends DomainError {
	public constructor(
		code:
			| "WORKSPACE_ALREADY_EXISTS"
			| "WORKSPACE_NOT_FOUND"
			| "INVALID_WORKSPACE_CONFIG",
		message: string,
		details?: Readonly<Record<string, unknown>>,
	) {
		super(code, message, details);
		this.name = "WorkspaceError";
	}
}

export class ProjectAliasError extends DomainError {
	public constructor(
		code:
			| "INVALID_PROJECT_ALIAS"
			| "PROJECT_ALIAS_ALREADY_EXISTS"
			| "PROJECT_ALIAS_NOT_FOUND",
		message: string,
		details?: Readonly<Record<string, unknown>>,
	) {
		super(code, message, details);
		this.name = "ProjectAliasError";
	}
}

export {
	addProjectAlias,
	initializeWorkspace,
	listProjectAliases,
	validateProjectAlias,
} from "./workspace.js";

export {
	MemoryMetadataError,
	isMemoryScope,
	isMemoryStatus,
	validateMemoryMetadata,
	type MemoryEntryMetadata,
	type MemoryMetadataErrorCode,
} from "./metadata.js";

export {
	MarkdownMemoryError,
	parseMemoryMarkdown,
	type MarkdownMemoryErrorCode,
	type ParsedMemoryMarkdown,
} from "./markdown.js";

export {
	MemoryRepositoryError,
	serializeMemoryMarkdown,
	storeReviewedMemory,
	type MemoryRepositoryErrorCode,
	type StoredMemoryEntry,
} from "./memory-repository.js";

export {
	MEMORY_INDEX_SCHEMA_VERSION,
	initializeMemoryIndexDatabase,
	rebuildMemoryIndex,
	type MemoryIndexDatabase,
	type MemoryIndexRebuildResult,
} from "./sqlite-index.js";

export {
	ingestPlainText,
	type PlainTextIngestionInput,
	type StoredIngestionRecord,
} from "./ingestion.js";

export {
	ingestJUnitXml,
	type JUnitIngestionInput,
	type StoredJUnitIngestionRecord,
} from "./junit-ingestion.js";

export {
	retrieveMemory,
	type RetrieveMemoryInput,
} from "./retrieval.js";

export {
	createDraftFromIngestion,
	validateDraftMemoryUpdate,
	type CreateDraftFromIngestionInput,
	type StoredDraftMemoryUpdate,
} from "./drafts.js";

export {
	approveDraft,
	type ApproveDraftInput,
	type ApprovedDraftResult,
} from "./approval.js";

export {
	deprecateMemory,
	type DeprecateMemoryInput,
	type DeprecatedMemoryResult,
} from "./deprecation.js";
