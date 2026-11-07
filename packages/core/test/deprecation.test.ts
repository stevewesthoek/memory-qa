import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	deprecateMemory,
	initializeWorkspace,
	parseMemoryMarkdown,
	rebuildMemoryIndex,
	retrieveMemory,
	storeReviewedMemory,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-deprecation-"));
	temporaryDirectories.push(root);
	return initializeWorkspace(root);
}

async function createReviewedMemory(
	config: Awaited<ReturnType<typeof initializeWorkspace>>,
	id: string,
) {
	return storeReviewedMemory(
		config,
		{
			id,
			scope: "client-project",
			status: "reviewed",
			project: "retail-web",
			created: "2026-06-19",
			last_reviewed: "2026-06-19",
			source_ref: "ingestion:failure-1",
			name: "Checkout timeout guidance",
		},
		"Checkout timeout after deployment.",
	);
}

async function replaceStatus(path: string, status: string): Promise<void> {
	const source = await readFile(path, "utf8");
	await writeFile(
		path,
		source.replace("status: reviewed", `status: ${status}`),
		"utf8",
	);
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("non-destructive memory deprecation", () => {
	it("deprecates reviewed memory in place while preserving body and provenance", async () => {
		const config = await createWorkspace();
		const stored = await createReviewedMemory(config, "checkout-timeout");
		const before = parseMemoryMarkdown(await readFile(stored.path, "utf8"));

		const result = await deprecateMemory(config, {
			memoryId: "checkout-timeout",
		});
		const after = parseMemoryMarkdown(await readFile(result.path, "utf8"));

		expect(result.path).toBe(stored.path);
		expect(after.body).toBe(before.body);
		expect(after.metadata).toMatchObject({
			id: before.metadata.id,
			scope: before.metadata.scope,
			status: "deprecated",
			projectAlias: before.metadata.projectAlias,
			sourceRef: before.metadata.sourceRef,
			name: before.metadata.name,
			created: before.metadata.created,
			lastReviewed: before.metadata.lastReviewed,
		});
	});

	it("deprecates trusted memory without moving or deleting it", async () => {
		const config = await createWorkspace();
		const stored = await createReviewedMemory(config, "trusted-checkout");
		await replaceStatus(stored.path, "trusted");

		const result = await deprecateMemory(config, {
			memoryId: "trusted-checkout",
		});
		const parsed = parseMemoryMarkdown(await readFile(stored.path, "utf8"));

		expect(result.path).toBe(stored.path);
		expect(parsed.metadata.status).toBe("deprecated");
	});

	it("excludes deprecated memory after index rebuild", async () => {
		const config = await createWorkspace();
		await createReviewedMemory(config, "checkout-timeout");
		await deprecateMemory(config, { memoryId: "checkout-timeout" });
		await rebuildMemoryIndex(config);

		expect(
			retrieveMemory(config, {
				projectAlias: "retail-web",
				query: "checkout timeout",
			}),
		).toEqual([]);
	});

	it("rejects missing memory", async () => {
		const config = await createWorkspace();

		await expect(
			deprecateMemory(config, { memoryId: "missing-memory" }),
		).rejects.toMatchObject({ code: "INVALID_MEMORY_STATUS" });
	});

	it("rejects ambiguous memory identifiers", async () => {
		const config = await createWorkspace();
		const stored = await createReviewedMemory(config, "duplicate-memory");
		const duplicatePath = join(
			config.memoryRoot,
			"personal",
			"duplicate-memory-copy.md",
		);
		await mkdir(dirname(duplicatePath), { recursive: true });
		await writeFile(duplicatePath, await readFile(stored.path, "utf8"), "utf8");

		await expect(
			deprecateMemory(config, { memoryId: "duplicate-memory" }),
		).rejects.toMatchObject({ code: "INVALID_MEMORY_STATUS" });
	});

	it("rejects already-deprecated memory", async () => {
		const config = await createWorkspace();
		await createReviewedMemory(config, "checkout-timeout");
		await deprecateMemory(config, { memoryId: "checkout-timeout" });

		await expect(
			deprecateMemory(config, { memoryId: "checkout-timeout" }),
		).rejects.toMatchObject({ code: "INVALID_MEMORY_STATUS" });
	});

	it("rejects invalid memory identifiers", async () => {
		const config = await createWorkspace();

		await expect(
			deprecateMemory(config, { memoryId: "../checkout-timeout" }),
		).rejects.toMatchObject({ code: "INVALID_MEMORY_STATUS" });
	});

	it.each([
		"raw",
		"draft",
	])("rejects %s memory as non-reviewable", async (status) => {
		const config = await createWorkspace();
		const stored = await createReviewedMemory(config, `${status}-memory`);
		await replaceStatus(stored.path, status);

		await expect(
			deprecateMemory(config, { memoryId: `${status}-memory` }),
		).rejects.toMatchObject({ code: "INVALID_MEMORY_STATUS" });
	});
});
