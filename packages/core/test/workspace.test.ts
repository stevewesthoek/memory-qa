import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	type ProjectAliasError,
	addProjectAlias,
	initializeWorkspace,
	listProjectAliases,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createTemporaryWorkspace(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "prochat-memory-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("workspace initialization", () => {
	it("creates the safe workspace structure", async () => {
		const root = await createTemporaryWorkspace();
		const config = await initializeWorkspace(root);

		expect(config.workspaceRoot).toBe(root);
		expect(
			JSON.parse(await readFile(join(root, "workspace.json"), "utf8")),
		).toEqual(config);
		expect(await readFile(join(root, "projects.json"), "utf8")).toContain(
			'"projects": []',
		);
		expect(await readFile(join(root, ".gitignore"), "utf8")).toContain(
			".prochat/",
		);
	});

	it("does not overwrite existing protected files", async () => {
		const root = await createTemporaryWorkspace();
		await initializeWorkspace(root);
		await writeFile(join(root, ".gitignore"), "custom-rule\n", "utf8");

		await initializeWorkspace(root);

		expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(
			"custom-rule\n",
		);
	});
});

describe("project aliases", () => {
	it("adds and lists aliases in stable order", async () => {
		const root = await createTemporaryWorkspace();
		const config = await initializeWorkspace(root);

		await addProjectAlias(config, "retail-web");
		await addProjectAlias(config, "api-tests");

		const projects = await listProjectAliases(config);
		expect(projects.map((project) => project.alias)).toEqual([
			"api-tests",
			"retail-web",
		]);
	});

	it("rejects duplicate aliases", async () => {
		const root = await createTemporaryWorkspace();
		const config = await initializeWorkspace(root);
		await addProjectAlias(config, "retail-web");

		await expect(addProjectAlias(config, "retail-web")).rejects.toMatchObject({
			code: "PROJECT_ALIAS_ALREADY_EXISTS",
		} satisfies Partial<ProjectAliasError>);
	});

	it("rejects invalid aliases", async () => {
		const root = await createTemporaryWorkspace();
		const config = await initializeWorkspace(root);

		await expect(addProjectAlias(config, "Client Name!")).rejects.toMatchObject(
			{
				code: "INVALID_PROJECT_ALIAS",
			} satisfies Partial<ProjectAliasError>,
		);
	});
});
