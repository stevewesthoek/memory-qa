import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	type MemoryRepositoryError,
	initializeWorkspace,
	parseMemoryMarkdown,
	serializeMemoryMarkdown,
	storeReviewedMemory,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

const reviewedMetadata = {
	id: "login-selector-failure",
	scope: "client-project",
	status: "reviewed",
	created: "2026-06-19",
	source_ref: "sanitized-test-run-123",
	name: "Login selector failure",
	project: "retail-web",
	last_reviewed: "2026-06-19",
};

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-memory-repository-"));
	temporaryDirectories.push(root);
	return initializeWorkspace(root);
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("reviewed Markdown serialization", () => {
	it("serializes reviewed memory into parseable Markdown", () => {
		const source = serializeMemoryMarkdown(
			reviewedMetadata,
			"# Login selector failure\n\nUse the stable data-testid selector.",
		);

		expect(parseMemoryMarkdown(source)).toEqual({
			metadata: {
				id: "login-selector-failure",
				scope: "client-project",
				status: "reviewed",
				created: "2026-06-19",
				sourceRef: "sanitized-test-run-123",
				name: "Login selector failure",
				projectAlias: "retail-web",
				lastReviewed: "2026-06-19",
			},
			body: "# Login selector failure\n\nUse the stable data-testid selector.",
		});
	});

	it("rejects empty bodies", () => {
		expect(() => serializeMemoryMarkdown(reviewedMetadata, "   ")).toThrowError(
			expect.objectContaining<Partial<MemoryRepositoryError>>({
				code: "EMPTY_MEMORY_BODY",
			}),
		);
	});

	it("rejects non-reviewed status", () => {
		expect(() =>
			serializeMemoryMarkdown({ ...reviewedMetadata, status: "draft" }, "Body"),
		).toThrowError(
			expect.objectContaining<Partial<MemoryRepositoryError>>({
				code: "MEMORY_NOT_REVIEWED",
			}),
		);
	});
});

describe("reviewed Markdown storage", () => {
	it("writes project-scoped memory to a readable Markdown file", async () => {
		const config = await createWorkspace();

		const stored = await storeReviewedMemory(
			config,
			reviewedMetadata,
			"# Login selector failure\n\nUse the stable selector.",
		);

		expect(stored.path).toBe(
			join(
				config.memoryRoot,
				"client-project",
				"retail-web",
				"login-selector-failure.md",
			),
		);

		const source = await readFile(stored.path, "utf8");
		expect(parseMemoryMarkdown(source).metadata.id).toBe(
			"login-selector-failure",
		);
	});

	it("does not overwrite duplicate memory files", async () => {
		const config = await createWorkspace();
		await storeReviewedMemory(config, reviewedMetadata, "First body");

		await expect(
			storeReviewedMemory(config, reviewedMetadata, "Second body"),
		).rejects.toMatchObject({
			code: "MEMORY_ALREADY_EXISTS",
		} satisfies Partial<MemoryRepositoryError>);
	});
});
