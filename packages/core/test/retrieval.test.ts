import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	initializeWorkspace,
	rebuildMemoryIndex,
	retrieveMemory,
	storeReviewedMemory,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-retrieval-"));
	temporaryDirectories.push(root);
	return initializeWorkspace(root);
}

async function addMemory(
	config: Awaited<ReturnType<typeof initializeWorkspace>>,
	input: {
		id: string;
		scope: "personal" | "client-project" | "cross-project" | "company-approved";
		status?: "reviewed" | "trusted" | "deprecated";
		project?: string;
		body?: string;
		name?: string;
	},
) {
	await storeReviewedMemory(
		config,
		{
			id: input.id,
			scope: input.scope,
			status: "reviewed",
			created: "2026-06-19",
			source_ref: `${input.id}.log`,
			...(input.project === undefined ? {} : { project: input.project }),
			...(input.name === undefined ? {} : { name: input.name }),
		},
		input.body ?? "Selector timeout guidance.",
	);

	if (input.status !== undefined && input.status !== "reviewed") {
		const index = await import("node:fs/promises");
		const path = join(
			config.memoryRoot,
			input.scope,
			...(input.project === undefined ? [] : [input.project]),
			`${input.id}.md`,
		);
		const source = await index.readFile(path, "utf8");
		await index.writeFile(
			path,
			source.replace("status: reviewed", `status: ${input.status}`),
			"utf8",
		);
	}
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("scoped memory retrieval", () => {
	it("isolates client-project memory and includes allowed shared scopes", async () => {
		const config = await createWorkspace();
		await addMemory(config, {
			id: "retail-selector",
			scope: "client-project",
			project: "retail-web",
		});
		await addMemory(config, {
			id: "api-selector",
			scope: "client-project",
			project: "api-tests",
		});
		await addMemory(config, { id: "personal-selector", scope: "personal" });
		await addMemory(config, { id: "shared-selector", scope: "cross-project" });
		await addMemory(config, {
			id: "company-selector",
			scope: "company-approved",
		});
		await rebuildMemoryIndex(config);

		const results = retrieveMemory(config, {
			projectAlias: "retail-web",
			query: "selector",
		});

		expect(results.map((result) => result.memoryId)).toEqual(
			expect.arrayContaining([
				"retail-selector",
				"personal-selector",
				"shared-selector",
				"company-selector",
			]),
		);
		expect(results.map((result) => result.memoryId)).not.toContain(
			"api-selector",
		);
	});

	it("excludes deprecated memory", async () => {
		const config = await createWorkspace();
		await addMemory(config, {
			id: "old-selector",
			scope: "personal",
			status: "deprecated",
		});
		await rebuildMemoryIndex(config);

		expect(
			retrieveMemory(config, {
				projectAlias: "retail-web",
				query: "selector",
			}),
		).toEqual([]);
	});

	it("ranks trusted memory above reviewed memory", async () => {
		const config = await createWorkspace();
		await addMemory(config, {
			id: "reviewed-selector",
			scope: "personal",
			status: "reviewed",
		});
		await addMemory(config, {
			id: "trusted-selector",
			scope: "personal",
			status: "trusted",
		});
		await rebuildMemoryIndex(config);

		const results = retrieveMemory(config, {
			projectAlias: "retail-web",
			query: "selector",
		});

		expect(results[0]?.memoryId).toBe("trusted-selector");
		expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
	});

	it("uses deterministic ordering for equal scores", async () => {
		const config = await createWorkspace();
		await addMemory(config, { id: "beta-selector", scope: "personal" });
		await addMemory(config, { id: "alpha-selector", scope: "personal" });
		await rebuildMemoryIndex(config);

		const results = retrieveMemory(config, {
			projectAlias: "retail-web",
			query: "selector",
		});

		expect(results.map((result) => result.memoryId)).toEqual([
			"alpha-selector",
			"beta-selector",
		]);
	});

	it("returns matched terms and explanations", async () => {
		const config = await createWorkspace();
		await addMemory(config, {
			id: "checkout-timeout",
			scope: "client-project",
			project: "retail-web",
			body: "Checkout timeout after deployment.",
		});
		await rebuildMemoryIndex(config);

		const [result] = retrieveMemory(config, {
			projectAlias: "retail-web",
			query: "checkout timeout",
		});

		expect(result?.matchedTerms).toEqual(["checkout", "timeout"]);
		expect(result?.explanation).toContain("project 'retail-web'");
		expect(result?.explanation).toContain("status reviewed");
	});

	it("returns no results for empty queries", async () => {
		const config = await createWorkspace();
		expect(
			retrieveMemory(config, {
				projectAlias: "retail-web",
				query: "   ",
			}),
		).toEqual([]);
	});

	it("respects result limits", async () => {
		const config = await createWorkspace();
		await addMemory(config, { id: "alpha-selector", scope: "personal" });
		await addMemory(config, { id: "beta-selector", scope: "personal" });
		await rebuildMemoryIndex(config);

		expect(
			retrieveMemory(config, {
				projectAlias: "retail-web",
				query: "selector",
				limit: 1,
			}),
		).toHaveLength(1);
	});
});
