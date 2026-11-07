import { describe, expect, it, vi } from "vitest";

import { DomainError, type WorkspaceConfig } from "memory-qa-core";
import { createMcpToolLayer, type McpCoreOperations } from "../src/index.js";

const workspace: WorkspaceConfig = {
	version: 1,
	workspaceRoot: "/tmp/prochat",
	projectsFile: "/tmp/prochat/projects.json",
	memoryRoot: "/tmp/prochat/memory",
	inboxRoot: "/tmp/prochat/inbox",
	draftsRoot: "/tmp/prochat/drafts",
	indexFile: "/tmp/prochat/index/memory.sqlite",
};

function createOperations(): McpCoreOperations {
	return {
		listProjects: vi.fn(async () => [
			{ alias: "retail-web", createdAt: "2026-06-19T00:00:00.000Z" },
		]),
		ingestPlainText: vi.fn(async (_config, input) => ({
			record: {
				id: "plain-1",
				projectAlias: input.projectAlias,
				sourceType: "plain-text",
				sourceRef: input.sourceRef,
				content: input.content,
				createdAt: "2026-06-19T00:00:00.000Z",
			},
			path: "/tmp/prochat/inbox/plain-1.json",
		})),
		ingestJUnitXml: vi.fn(async (_config, input) => ({
			record: {
				id: "junit-1",
				projectAlias: input.projectAlias,
				sourceType: "junit-xml",
				sourceRef: input.sourceRef,
				content: input.xml,
				createdAt: "2026-06-19T00:00:00.000Z",
			},
			path: "/tmp/prochat/inbox/junit-1.json",
		})),
		find: vi.fn(() => [
			{
				memoryId: "memory-1",
				projectAlias: "retail-web",
				scope: "client-project",
				status: "reviewed",
				sourcePath: "client-project/retail-web/memory-1.md",
				score: 120,
				matchedTerms: ["checkout"],
				explanation: "Matched checkout.",
			},
		]),
		createDraft: vi.fn(async (_config, input) => ({
			draft: {
				id: "draft-1",
				projectAlias: input.projectAlias,
				targetScope: input.targetScope ?? "client-project",
				sourceIngestionId: input.ingestionId,
				title: input.title,
				body: "Draft body",
				status: "draft",
				sanitizationWarnings: [],
				createdAt: "2026-06-19T00:00:00.000Z",
			},
			path: "/tmp/prochat/drafts/draft-1.json",
		})),
		approveDraft: vi.fn(async (_config, input) => ({
			draft: {
				id: input.draftId,
				projectAlias: "retail-web",
				targetScope: "client-project",
				sourceIngestionId: "ingestion-1",
				title: "Approved draft",
				body: "Approved body",
				status: "approved",
				sanitizationWarnings: [],
				createdAt: "2026-06-19T00:00:00.000Z",
				approvedAt: "2026-06-19T01:00:00.000Z",
			},
			draftPath: "/tmp/prochat/drafts/draft-1.json",
			memory: {
				metadata: {
					id: input.draftId,
					scope: "client-project",
					status: "reviewed",
					projectAlias: "retail-web",
					created: "2026-06-19",
					sourceRef: "ingestion:ingestion-1",
				},
				body: "Approved body",
				path: "/tmp/prochat/memory/draft-1.md",
			},
		})),
		rebuildIndex: vi.fn(async () => ({
			indexedFiles: 1,
			indexFile: workspace.indexFile,
		})),
	};
}

function requireTool(
	layer: ReturnType<typeof createMcpToolLayer>,
	name: string,
) {
	const tool = layer.getTool(name);
	if (tool === undefined) {
		throw new Error(`Expected MCP tool '${name}' to be registered.`);
	}
	return tool;
}

function getTool(name: string, operations = createOperations()) {
	const layer = createMcpToolLayer({ workspace, operations });
	return { tool: requireTool(layer, name), operations };
}

describe("MCP tool layer", () => {
	it("registers all six requested tools", () => {
		const layer = createMcpToolLayer({
			workspace,
			operations: createOperations(),
		});

		expect(layer.tools.map((tool) => tool.name)).toEqual([
			"qa_memory_list_projects",
			"qa_memory_ingest_failure",
			"qa_memory_find",
			"qa_memory_create_draft",
			"qa_memory_approve_draft",
			"qa_memory_rebuild_index",
		]);
	});

	it("rejects non-object and missing-string arguments", async () => {
		const { tool } = getTool("qa_memory_find");

		await expect(tool.invoke(null)).resolves.toEqual({
			ok: false,
			error: {
				code: "INVALID_ARGUMENTS",
				message: "Tool arguments must be an object.",
			},
		});
		await expect(
			tool.invoke({ projectAlias: "retail-web" }),
		).resolves.toMatchObject({
			ok: false,
			error: { code: "INVALID_ARGUMENTS" },
		});
	});

	it("delegates list, find, draft creation, approval, and rebuild", async () => {
		const operations = createOperations();
		const layer = createMcpToolLayer({ workspace, operations });

		await expect(
			requireTool(layer, "qa_memory_list_projects").invoke({}),
		).resolves.toMatchObject({ ok: true });
		await expect(
			requireTool(layer, "qa_memory_find").invoke({
				projectAlias: "retail-web",
				query: "checkout",
				limit: 5,
			}),
		).resolves.toMatchObject({ ok: true });
		await expect(
			requireTool(layer, "qa_memory_create_draft").invoke({
				ingestionId: "ingestion-1",
				projectAlias: "retail-web",
				title: "Checkout guidance",
			}),
		).resolves.toMatchObject({ ok: true });
		await expect(
			requireTool(layer, "qa_memory_approve_draft").invoke({
				draftId: "draft-1",
			}),
		).resolves.toMatchObject({ ok: true });
		await expect(
			requireTool(layer, "qa_memory_rebuild_index").invoke({}),
		).resolves.toMatchObject({ ok: true });

		expect(operations.listProjects).toHaveBeenCalledWith(workspace);
		expect(operations.find).toHaveBeenCalledWith(workspace, {
			projectAlias: "retail-web",
			query: "checkout",
			limit: 5,
		});
		expect(operations.createDraft).toHaveBeenCalledWith(workspace, {
			ingestionId: "ingestion-1",
			projectAlias: "retail-web",
			title: "Checkout guidance",
		});
		expect(operations.approveDraft).toHaveBeenCalledWith(workspace, {
			draftId: "draft-1",
		});
		expect(operations.rebuildIndex).toHaveBeenCalledWith(workspace);
	});

	it("routes plain-text and JUnit ingestion separately", async () => {
		const operations = createOperations();
		const layer = createMcpToolLayer({ workspace, operations });
		const tool = requireTool(layer, "qa_memory_ingest_failure");

		await tool.invoke({
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "Assertion failed",
			sourceType: "plain-text",
		});
		await tool.invoke({
			projectAlias: "retail-web",
			sourceRef: "junit.xml",
			content: "<testsuite />",
			sourceType: "junit-xml",
		});

		expect(operations.ingestPlainText).toHaveBeenCalledTimes(1);
		expect(operations.ingestJUnitXml).toHaveBeenCalledTimes(1);
	});

	it("maps domain errors without exposing transport details", async () => {
		const operations = createOperations();
		operations.listProjects = vi.fn(async () => {
			throw new DomainError("WORKSPACE_NOT_FOUND", "Workspace missing.");
		});
		const layer = createMcpToolLayer({ workspace, operations });

		await expect(
			requireTool(layer, "qa_memory_list_projects").invoke({}),
		).resolves.toEqual({
			ok: false,
			error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace missing." },
		});
	});

	it("requires a local workspace configuration", async () => {
		const layer = createMcpToolLayer({ operations: createOperations() });

		await expect(
			requireTool(layer, "qa_memory_list_projects").invoke({}),
		).resolves.toEqual({
			ok: false,
			error: {
				code: "INVALID_ARGUMENTS",
				message: "A local workspace configuration is required.",
			},
		});
	});

	it("requires an explicit draftId for approval", async () => {
		const { tool, operations } = getTool("qa_memory_approve_draft");

		await expect(tool.invoke({})).resolves.toMatchObject({
			ok: false,
			error: { code: "INVALID_ARGUMENTS" },
		});
		expect(operations.approveDraft).not.toHaveBeenCalled();
	});
});

describe("MCP availability diagnostics", () => {
	it("reports registered tools when available", async () => {
		const { diagnoseMcpAvailability } = await import("../src/index.js");

		expect(
			diagnoseMcpAvailability({ workspace, operations: createOperations() }),
		).toEqual({
			available: true,
			workspaceConfigured: true,
			code: "MCP_AVAILABLE",
			message: "MCP tools are available for the configured local workspace.",
			toolCount: 6,
			toolNames: [
				"qa_memory_list_projects",
				"qa_memory_ingest_failure",
				"qa_memory_find",
				"qa_memory_create_draft",
				"qa_memory_approve_draft",
				"qa_memory_rebuild_index",
			],
		});
	});

	it("reports an actionable missing-workspace diagnostic", async () => {
		const { diagnoseMcpAvailability } = await import("../src/index.js");

		expect(diagnoseMcpAvailability({ operations: createOperations() })).toEqual(
			{
				available: false,
				workspaceConfigured: false,
				code: "MCP_WORKSPACE_REQUIRED",
				message:
					"Configure a local Memory QA workspace before enabling MCP tools.",
				toolCount: 0,
				toolNames: [],
			},
		);
	});

	it("reports initialization failures with a stable code", async () => {
		const { diagnoseMcpAvailability } = await import("../src/index.js");
		const operations = createOperations();
		Object.defineProperty(operations, "listProjects", {
			enumerable: true,
			get: () => {
				throw new Error("broken operation registry");
			},
		});

		const diagnostic = diagnoseMcpAvailability({ workspace, operations });

		expect(diagnostic).toMatchObject({
			available: false,
			workspaceConfigured: true,
			code: "MCP_INITIALIZATION_FAILED",
			toolCount: 0,
			toolNames: [],
		});
		expect(diagnostic.message).toContain(
			"Check the local workspace configuration",
		);
		expect(diagnostic.message).toContain("broken operation registry");
	});
});

describe("MCP internal error sanitization", () => {
	it("does not expose private filesystem or database details", async () => {
		const operations = createOperations();
		operations.listProjects = vi.fn(async () => {
			throw new Error(
				"Failed to open database at /private/company/client-a/.prochat/index.sqlite",
			);
		});
		const { tool } = getTool("qa_memory_list_projects", operations);

		const result = await tool.invoke({});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "INTERNAL_ERROR",
				message: "An unexpected internal error occurred.",
			},
		});
		expect(JSON.stringify(result)).not.toContain("/private/company/client-a");
		expect(JSON.stringify(result)).not.toContain("index.sqlite");
	});
});
