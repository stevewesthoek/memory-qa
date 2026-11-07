import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	addProjectAlias,
	approveDraft,
	createDraftFromIngestion,
	ingestPlainText,
	initializeWorkspace,
	parseMemoryMarkdown,
	storeReviewedMemory,
	type DraftMemoryUpdate,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-approval-"));
	temporaryDirectories.push(root);
	const config = await initializeWorkspace(root);
	await addProjectAlias(config, "retail-web");
	return config;
}

async function createCleanDraft(
	config: Awaited<ReturnType<typeof initializeWorkspace>>,
) {
	const ingestion = await ingestPlainText(config, {
		projectAlias: "retail-web",
		sourceRef: "failure.log",
		content: "Checkout timeout after deployment.",
	});
	const stored = await createDraftFromIngestion(config, {
		ingestionId: ingestion.record.id,
		projectAlias: "retail-web",
		title: "Checkout timeout guidance",
	});
	return { ingestion, stored };
}

async function overwriteDraft(
	path: string,
	update: (draft: DraftMemoryUpdate) => unknown,
): Promise<void> {
	const draft = JSON.parse(await readFile(path, "utf8")) as DraftMemoryUpdate;
	await writeFile(path, `${JSON.stringify(update(draft), null, 2)}\n`, "utf8");
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("approval-controlled writes", () => {
	it("approves a clean draft and persists reviewed Markdown", async () => {
		const config = await createWorkspace();
		const { ingestion, stored } = await createCleanDraft(config);

		const result = await approveDraft(config, { draftId: stored.draft.id });

		expect(result.draft.status).toBe("approved");
		expect(result.draft.approvedAt).toBeDefined();
		expect(result.memory.metadata).toMatchObject({
			id: stored.draft.id,
			scope: "client-project",
			status: "reviewed",
			projectAlias: "retail-web",
			name: "Checkout timeout guidance",
			sourceRef: `ingestion:${ingestion.record.id}`,
		});
		expect(result.memory.body).toBe("Checkout timeout after deployment.");

		const parsed = parseMemoryMarkdown(
			await readFile(result.memory.path, "utf8"),
		);
		expect(parsed.metadata.sourceRef).toBe(`ingestion:${ingestion.record.id}`);
		expect(parsed.metadata.projectAlias).toBe("retail-web");
		expect(parsed.body).toBe("Checkout timeout after deployment.");
	});

	it("persists the approved draft state", async () => {
		const config = await createWorkspace();
		const { stored } = await createCleanDraft(config);

		const result = await approveDraft(config, { draftId: stored.draft.id });
		const persisted = JSON.parse(await readFile(result.draftPath, "utf8"));

		expect(persisted).toEqual(result.draft);
		expect(persisted.status).toBe("approved");
		expect(Date.parse(persisted.approvedAt)).not.toBeNaN();
	});

	it("rejects missing drafts", async () => {
		const config = await createWorkspace();

		await expect(
			approveDraft(config, { draftId: "missing-draft" }),
		).rejects.toMatchObject({ code: "INVALID_DRAFT" });
	});

	it("rejects invalid persisted drafts", async () => {
		const config = await createWorkspace();
		const { stored } = await createCleanDraft(config);
		await writeFile(stored.path, "{not-json}\n", "utf8");

		await expect(
			approveDraft(config, { draftId: stored.draft.id }),
		).rejects.toMatchObject({ code: "INVALID_DRAFT" });
	});

	it("rejects rejected drafts", async () => {
		const config = await createWorkspace();
		const { stored } = await createCleanDraft(config);
		await overwriteDraft(stored.path, (draft) => ({
			...draft,
			status: "rejected",
		}));

		await expect(
			approveDraft(config, { draftId: stored.draft.id }),
		).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
	});

	it("rejects already-approved drafts", async () => {
		const config = await createWorkspace();
		const { stored } = await createCleanDraft(config);
		await approveDraft(config, { draftId: stored.draft.id });

		await expect(
			approveDraft(config, { draftId: stored.draft.id }),
		).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
	});

	it("rejects unresolved sanitization warnings", async () => {
		const config = await createWorkspace();
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "token=secret-value",
		});
		const stored = await createDraftFromIngestion(config, {
			ingestionId: ingestion.record.id,
			projectAlias: "retail-web",
			title: "Unsafe evidence",
		});

		await expect(
			approveDraft(config, { draftId: stored.draft.id }),
		).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
	});

	it("preserves the draft when reviewed memory already exists", async () => {
		const config = await createWorkspace();
		const { stored } = await createCleanDraft(config);
		await storeReviewedMemory(
			config,
			{
				id: stored.draft.id,
				scope: "client-project",
				status: "reviewed",
				project: "retail-web",
				created: "2026-06-19",
				source_ref: "existing-memory",
			},
			"Existing reviewed memory.",
		);

		await expect(
			approveDraft(config, { draftId: stored.draft.id }),
		).rejects.toMatchObject({ code: "MEMORY_ALREADY_EXISTS" });

		const persisted = JSON.parse(await readFile(stored.path, "utf8"));
		expect(persisted.status).toBe("draft");
		expect(persisted.approvedAt).toBeUndefined();
	});
});

describe("approval recovery", () => {
	it("retries safely after reviewed memory is stored but draft status writing fails", async () => {
		const config = await createWorkspace();
		const { stored } = await createCleanDraft(config);
		const simulatedFailure = new Error("simulated draft status write failure");

		await expect(
			approveDraft(
				config,
				{ draftId: stored.draft.id },
				{
					writeDraftFile: async () => {
						throw simulatedFailure;
					},
				},
			),
		).rejects.toBe(simulatedFailure);

		const pendingDraft = JSON.parse(
			await readFile(stored.path, "utf8"),
		) as DraftMemoryUpdate;
		expect(pendingDraft.status).toBe("draft");

		const memoryPath = join(
			config.memoryRoot,
			"client-project",
			"retail-web",
			`${stored.draft.id}.md`,
		);
		const existingMemory = parseMemoryMarkdown(
			await readFile(memoryPath, "utf8"),
		);
		await writeFile(
			memoryPath,
			[
				"---",
				`id: ${existingMemory.metadata.id}`,
				`scope: ${existingMemory.metadata.scope}`,
				`status: ${existingMemory.metadata.status}`,
				`created: ${existingMemory.metadata.created}`,
				"last_reviewed: 2026-06-20",
				`source_ref: ${existingMemory.metadata.sourceRef}`,
				`name: ${existingMemory.metadata.name}`,
				`project: ${existingMemory.metadata.projectAlias}`,
				"---",
				"",
				existingMemory.body,
				"",
			].join("\n"),
			"utf8",
		);

		const recovered = await approveDraft(config, {
			draftId: stored.draft.id,
		});
		expect(recovered.draft.status).toBe("approved");
		expect(recovered.memory.path).toBe(memoryPath);

		const persistedDraft = JSON.parse(
			await readFile(stored.path, "utf8"),
		) as DraftMemoryUpdate;
		expect(persistedDraft.status).toBe("approved");
	});
});
