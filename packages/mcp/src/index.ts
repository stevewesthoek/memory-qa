import {
	DomainError,
	approveDraft,
	createDraftFromIngestion,
	ingestJUnitXml,
	ingestPlainText,
	listProjectAliases,
	rebuildMemoryIndex,
	retrieveMemory,
	type MemoryScope,
	type WorkspaceConfig,
} from "memory-qa-core";

export interface McpServerOptions {
	readonly workspace?: WorkspaceConfig;
	readonly operations?: Partial<McpCoreOperations>;
}

export interface McpServerPlaceholder {
	readonly name: "prochat-memory";
	readonly version: "0.1.0";
	readonly options: McpServerOptions;
}

export interface McpToolError {
	readonly code: string;
	readonly message: string;
}

export type McpToolResult<T = unknown> =
	| { readonly ok: true; readonly data: T }
	| { readonly ok: false; readonly error: McpToolError };

export interface McpToolDefinition {
	readonly name:
		| "qa_memory_list_projects"
		| "qa_memory_ingest_failure"
		| "qa_memory_find"
		| "qa_memory_create_draft"
		| "qa_memory_approve_draft"
		| "qa_memory_rebuild_index";
	readonly description: string;
	invoke(argumentsValue: unknown): Promise<McpToolResult>;
}

export interface McpToolLayer {
	readonly name: "prochat-memory";
	readonly version: "0.1.0";
	readonly tools: readonly McpToolDefinition[];
	getTool(name: string): McpToolDefinition | undefined;
}

export interface McpCoreOperations {
	listProjects(config: WorkspaceConfig): ReturnType<typeof listProjectAliases>;
	ingestPlainText: typeof ingestPlainText;
	ingestJUnitXml: typeof ingestJUnitXml;
	find: typeof retrieveMemory;
	createDraft: typeof createDraftFromIngestion;
	approveDraft: typeof approveDraft;
	rebuildIndex: typeof rebuildMemoryIndex;
}

const defaultOperations: McpCoreOperations = {
	listProjects: listProjectAliases,
	ingestPlainText,
	ingestJUnitXml,
	find: retrieveMemory,
	createDraft: createDraftFromIngestion,
	approveDraft,
	rebuildIndex: rebuildMemoryIndex,
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown): Record<string, unknown> {
	if (!isObject(value)) {
		throw new TypeError("Tool arguments must be an object.");
	}

	return value;
}

function requireString(value: Record<string, unknown>, field: string): string {
	const candidate = value[field];
	if (typeof candidate !== "string" || candidate.trim() === "") {
		throw new TypeError(`'${field}' must be a non-empty string.`);
	}

	return candidate;
}

function optionalNumber(
	value: Record<string, unknown>,
	field: string,
): number | undefined {
	const candidate = value[field];
	if (candidate === undefined) {
		return undefined;
	}
	if (!Number.isInteger(candidate) || (candidate as number) < 1) {
		throw new TypeError(`'${field}' must be a positive integer.`);
	}

	return candidate as number;
}

function mapError(error: unknown): McpToolResult<never> {
	if (error instanceof DomainError) {
		return {
			ok: false,
			error: { code: error.code, message: error.message },
		};
	}
	if (error instanceof TypeError) {
		return {
			ok: false,
			error: { code: "INVALID_ARGUMENTS", message: error.message },
		};
	}

	return {
		ok: false,
		error: {
			code: "INTERNAL_ERROR",
			message: "An unexpected internal error occurred.",
		},
	};
}

function requireWorkspace(options: McpServerOptions): WorkspaceConfig {
	if (options.workspace === undefined) {
		throw new TypeError("A local workspace configuration is required.");
	}

	return options.workspace;
}

function createTool(
	name: McpToolDefinition["name"],
	description: string,
	handler: (argumentsValue: unknown) => Promise<unknown> | unknown,
): McpToolDefinition {
	return {
		name,
		description,
		async invoke(argumentsValue: unknown): Promise<McpToolResult> {
			try {
				return { ok: true, data: await handler(argumentsValue) };
			} catch (error) {
				return mapError(error);
			}
		},
	};
}

export function createMcpToolLayer(options: McpServerOptions): McpToolLayer {
	const operations: McpCoreOperations = {
		...defaultOperations,
		...options.operations,
	};

	const tools: readonly McpToolDefinition[] = [
		createTool(
			"qa_memory_list_projects",
			"List configured local project aliases.",
			async (argumentsValue) => {
				requireObject(argumentsValue);
				return operations.listProjects(requireWorkspace(options));
			},
		),
		createTool(
			"qa_memory_ingest_failure",
			"Ingest plain-text or JUnit XML failure evidence locally.",
			async (argumentsValue) => {
				const args = requireObject(argumentsValue);
				const projectAlias = requireString(args, "projectAlias");
				const sourceRef = requireString(args, "sourceRef");
				const content = requireString(args, "content");
				const sourceType = args["sourceType"] ?? "plain-text";

				if (sourceType === "junit-xml") {
					return operations.ingestJUnitXml(requireWorkspace(options), {
						projectAlias,
						sourceRef,
						xml: content,
					});
				}
				if (sourceType !== "plain-text") {
					throw new TypeError(
						"'sourceType' must be 'plain-text' or 'junit-xml'.",
					);
				}

				return operations.ingestPlainText(requireWorkspace(options), {
					projectAlias,
					sourceRef,
					content,
				});
			},
		),
		createTool(
			"qa_memory_find",
			"Find scoped local memory with match explanations.",
			(argumentsValue) => {
				const args = requireObject(argumentsValue);
				const limit = optionalNumber(args, "limit");
				return operations.find(requireWorkspace(options), {
					projectAlias: requireString(args, "projectAlias"),
					query: requireString(args, "query"),
					...(limit === undefined ? {} : { limit }),
				});
			},
		),
		createTool(
			"qa_memory_create_draft",
			"Create a local draft memory update from an ingestion record.",
			async (argumentsValue) => {
				const args = requireObject(argumentsValue);
				const targetScope = args["targetScope"];
				if (targetScope !== undefined && typeof targetScope !== "string") {
					throw new TypeError("'targetScope' must be a string.");
				}

				return operations.createDraft(requireWorkspace(options), {
					ingestionId: requireString(args, "ingestionId"),
					projectAlias: requireString(args, "projectAlias"),
					title: requireString(args, "title"),
					...(targetScope === undefined
						? {}
						: { targetScope: targetScope as MemoryScope }),
				});
			},
		),
		createTool(
			"qa_memory_approve_draft",
			"Approve one explicit local draft identifier.",
			async (argumentsValue) => {
				const args = requireObject(argumentsValue);
				return operations.approveDraft(requireWorkspace(options), {
					draftId: requireString(args, "draftId"),
				});
			},
		),
		createTool(
			"qa_memory_rebuild_index",
			"Rebuild the disposable local SQLite index from Markdown.",
			async (argumentsValue) => {
				requireObject(argumentsValue);
				return operations.rebuildIndex(requireWorkspace(options));
			},
		),
	];

	return {
		name: "prochat-memory",
		version: "0.1.0",
		tools,
		getTool: (name) => tools.find((tool) => tool.name === name),
	};
}

export function createMcpServerPlaceholder(
	options: McpServerOptions = {},
): McpServerPlaceholder {
	return {
		name: "prochat-memory",
		version: "0.1.0",
		options,
	};
}

export type McpDiagnosticCode =
	| "MCP_AVAILABLE"
	| "MCP_WORKSPACE_REQUIRED"
	| "MCP_INITIALIZATION_FAILED";

export interface McpAvailabilityDiagnostic {
	readonly available: boolean;
	readonly workspaceConfigured: boolean;
	readonly code: McpDiagnosticCode;
	readonly message: string;
	readonly toolCount: number;
	readonly toolNames: readonly McpToolDefinition["name"][];
}

export function diagnoseMcpAvailability(
	options: McpServerOptions,
): McpAvailabilityDiagnostic {
	if (options.workspace === undefined) {
		return {
			available: false,
			workspaceConfigured: false,
			code: "MCP_WORKSPACE_REQUIRED",
			message:
				"Configure a local Memory QA workspace before enabling MCP tools.",
			toolCount: 0,
			toolNames: [],
		};
	}

	try {
		const layer = createMcpToolLayer(options);
		const toolNames = layer.tools.map((tool) => tool.name);

		return {
			available: true,
			workspaceConfigured: true,
			code: "MCP_AVAILABLE",
			message: "MCP tools are available for the configured local workspace.",
			toolCount: toolNames.length,
			toolNames,
		};
	} catch (error) {
		return {
			available: false,
			workspaceConfigured: true,
			code: "MCP_INITIALIZATION_FAILED",
			message: `MCP tools could not be initialized. Check the local workspace configuration and MCP package setup. ${
				error instanceof Error ? error.message : String(error)
			}`,
			toolCount: 0,
			toolNames: [],
		};
	}
}
