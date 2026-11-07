import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	addProjectAlias,
	createDraftFromIngestion,
	ingestPlainText,
	initializeWorkspace,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-drafts-"));
	temporaryDirectories.push(root);
	const config = await initializeWorkspace(root);
	await addProjectAlias(config, "retail-web");
	return config;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("draft creation from ingestion", () => {
	it("creates and persists a draft with project propagation", async () => {
		const config = await createWorkspace();
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

		expect(stored.draft).toMatchObject({
			projectAlias: "retail-web",
			targetScope: "client-project",
			sourceIngestionId: ingestion.record.id,
			title: "Checkout timeout guidance",
			body: "Checkout timeout after deployment.",
			status: "draft",
			sanitizationWarnings: [],
		});

		const persisted = JSON.parse(await readFile(stored.path, "utf8"));
		expect(persisted).toEqual(stored.draft);
	});

	it("rejects missing ingestion records", async () => {
		const config = await createWorkspace();

		await expect(
			createDraftFromIngestion(config, {
				ingestionId: "missing-record",
				projectAlias: "retail-web",
				title: "Missing evidence",
			}),
		).rejects.toMatchObject({ code: "INVALID_DRAFT" });
	});

	it("rejects invalid titles", async () => {
		const config = await createWorkspace();
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "Failure evidence.",
		});

		await expect(
			createDraftFromIngestion(config, {
				ingestionId: ingestion.record.id,
				projectAlias: "retail-web",
				title: "   ",
			}),
		).rejects.toMatchObject({ code: "INVALID_DRAFT" });
	});

	it("rejects invalid target scopes", async () => {
		const config = await createWorkspace();
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "Failure evidence.",
		});

		await expect(
			createDraftFromIngestion(config, {
				ingestionId: ingestion.record.id,
				projectAlias: "retail-web",
				title: "Failure guidance",
				targetScope: "invalid-scope" as never,
			}),
		).rejects.toMatchObject({ code: "INVALID_DRAFT" });
	});

	it("warns about possible secrets, paths, and email addresses", async () => {
		const config = await createWorkspace();
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content:
				"token=synthetic-placeholder-value\nPath: /Users/example-user/qa-workspace/run.log qa-tester@example.test",
		});

		const stored = await createDraftFromIngestion(config, {
			ingestionId: ingestion.record.id,
			projectAlias: "retail-web",
			title: "Sanitize failure evidence",
		});

		expect(stored.draft.sanitizationWarnings).toEqual([
			"Evidence may contain credentials or secret material.",
			"Evidence may contain a local absolute filesystem path.",
			"Evidence may contain an email address.",
		]);
	});

	it("rejects ingestion records that do not belong to the requested project", async () => {
		const config = await createWorkspace();
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "Failure evidence.",
		});
		const copiedPath = join(
			config.inboxRoot,
			"api-tests",
			`${ingestion.record.id}.json`,
		);
		await writeFile(copiedPath, `${JSON.stringify(ingestion.record)}\n`, {
			encoding: "utf8",
			flag: "wx",
		}).catch(async () => {
			const { mkdir } = await import("node:fs/promises");
			await mkdir(join(config.inboxRoot, "api-tests"), { recursive: true });
			await writeFile(
				copiedPath,
				`${JSON.stringify(ingestion.record)}\n`,
				"utf8",
			);
		});

		await expect(
			createDraftFromIngestion(config, {
				ingestionId: ingestion.record.id,
				projectAlias: "api-tests",
				title: "Wrong project",
			}),
		).rejects.toMatchObject({ code: "INVALID_DRAFT" });
	});
});

describe("persisted draft validation", () => {
	const validDraft = {
		id: "draft-1",
		projectAlias: "retail-web",
		targetScope: "client-project",
		sourceIngestionId: "ingestion-1",
		title: "Checkout timeout guidance",
		body: "Use the stable selector after deployment.",
		status: "draft",
		sanitizationWarnings: [],
		createdAt: "2026-06-19T18:00:00.000Z",
	} as const;

	it("rejects non-object persisted drafts", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(() => validateDraftMemoryUpdate(null)).toThrowError(
			expect.objectContaining({ code: "INVALID_DRAFT" }),
		);
	});

	it("requires project provenance for client-project drafts", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		const { projectAlias: _projectAlias, ...withoutProject } = validDraft;
		expect(() => validateDraftMemoryUpdate(withoutProject)).toThrowError(
			expect.objectContaining({ code: "INVALID_DRAFT" }),
		);
	});

	it.each([
		["title", { ...validDraft, title: "   " }],
		["body", { ...validDraft, body: "   " }],
	])("rejects invalid %s values", async (_field, draft) => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(() => validateDraftMemoryUpdate(draft)).toThrowError(
			expect.objectContaining({ code: "INVALID_DRAFT" }),
		);
	});

	it("rejects invalid timestamps", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(() =>
			validateDraftMemoryUpdate({ ...validDraft, createdAt: "not-a-date" }),
		).toThrowError(expect.objectContaining({ code: "INVALID_DRAFT" }));
	});

	it("rejects invalid statuses", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(() =>
			validateDraftMemoryUpdate({ ...validDraft, status: "published" }),
		).toThrowError(expect.objectContaining({ code: "INVALID_DRAFT" }));
	});

	it("requires approved drafts to have an approval timestamp", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(() =>
			validateDraftMemoryUpdate({ ...validDraft, status: "approved" }),
		).toThrowError(expect.objectContaining({ code: "INVALID_DRAFT" }));
	});

	it("rejects approval timestamps on non-approved drafts", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(() =>
			validateDraftMemoryUpdate({
				...validDraft,
				approvedAt: "2026-06-19T18:05:00.000Z",
			}),
		).toThrowError(expect.objectContaining({ code: "INVALID_DRAFT" }));
	});

	it("accepts approved drafts with a valid approval timestamp", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(
			validateDraftMemoryUpdate({
				...validDraft,
				status: "approved",
				approvedAt: "2026-06-19T18:05:00.000Z",
			}),
		).toMatchObject({
			status: "approved",
			approvedAt: "2026-06-19T18:05:00.000Z",
		});
	});

	it("rejects invalid sanitization warning arrays", async () => {
		const { validateDraftMemoryUpdate } = await import("../src/index.js");
		expect(() =>
			validateDraftMemoryUpdate({
				...validDraft,
				sanitizationWarnings: [""],
			}),
		).toThrowError(expect.objectContaining({ code: "INVALID_DRAFT" }));
	});
});
