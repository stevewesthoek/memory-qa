import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli, type CliIo } from "../src/index.js";

const temporaryDirectories: string[] = [];

function createIo(): {
	readonly io: CliIo;
	readonly stdout: string[];
	readonly stderr: string[];
} {
	const stdout: string[] = [];
	const stderr: string[] = [];

	return {
		stdout,
		stderr,
		io: {
			stdout: (message) => stdout.push(message),
			stderr: (message) => stderr.push(message),
		},
	};
}

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "prochat-workflow-"));
	temporaryDirectories.push(directory);
	return directory;
}

function requireItem<T>(value: T | undefined, message: string): T {
	if (value === undefined) {
		throw new Error(message);
	}
	return value;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("CLI integration workflow", () => {
	it("runs plain-text evidence through approval and retrieval", async () => {
		const root = await createTemporaryDirectory();
		const evidencePath = join(root, "checkout-failure.log");
		await writeFile(
			evidencePath,
			"Checkout timeout after deployment. Use the stable selector.",
			"utf8",
		);

		expect(await runCli(["init", root], createIo().io)).toBe(0);
		expect(
			await runCli(["project", "add", "retail-web", root], createIo().io),
		).toBe(0);

		const ingestIo = createIo();
		expect(
			await runCli(
				["ingest", evidencePath, "--project", "retail-web", root],
				ingestIo.io,
			),
		).toBe(0);
		expect(ingestIo.stderr).toEqual([]);

		const inboxFiles = await readdir(join(root, "inbox", "retail-web"));
		expect(inboxFiles).toHaveLength(1);
		const ingestionId = requireItem(
			inboxFiles[0],
			"Expected one plain-text ingestion record.",
		).replace(/\.json$/u, "");

		const draftIo = createIo();
		expect(
			await runCli(
				[
					"draft",
					"create",
					"--from",
					ingestionId,
					"--project",
					"retail-web",
					"--title",
					"Checkout timeout guidance",
					root,
				],
				draftIo.io,
			),
		).toBe(0);
		expect(draftIo.stderr).toEqual([]);

		const draftFiles = await readdir(join(root, "drafts", "retail-web"));
		expect(draftFiles).toHaveLength(1);
		const draftId = requireItem(
			draftFiles[0],
			"Expected one plain-text draft record.",
		).replace(/\.json$/u, "");

		const approveIo = createIo();
		expect(await runCli(["approve", draftId, root], approveIo.io)).toBe(0);
		expect(approveIo.stderr).toEqual([]);

		const memoryPath = join(
			root,
			"memory",
			"client-project",
			"retail-web",
			`${draftId}.md`,
		);
		const memorySource = await readFile(memoryPath, "utf8");
		expect(memorySource).toContain("status: reviewed");
		expect(memorySource).toContain(`source_ref: "ingestion:${ingestionId}"`);
		expect(memorySource).toContain("Checkout timeout after deployment.");

		expect(await runCli(["index", "rebuild", root], createIo().io)).toBe(0);

		const retrieveIo = createIo();
		expect(
			await runCli(
				[
					"retrieve",
					"--project",
					"retail-web",
					"--query",
					"checkout timeout",
					root,
				],
				retrieveIo.io,
			),
		).toBe(0);
		expect(retrieveIo.stderr).toEqual([]);
		expect(retrieveIo.stdout).toHaveLength(1);
		expect(retrieveIo.stdout[0]).toContain(draftId);
		expect(retrieveIo.stdout[0]).toContain("client-project\treviewed");
		expect(retrieveIo.stdout[0]).toContain("Matched checkout, timeout");
	});
});

describe("JUnit XML CLI pilot", () => {
	it("runs JUnit failure evidence through approval and retrieval", async () => {
		const root = await createTemporaryDirectory();
		const evidencePath = join(root, "junit.xml");
		await writeFile(
			evidencePath,
			`<?xml version="1.0"?>
<testsuite name="checkout" tests="1" failures="1">
  <testcase classname="Checkout" name="declined card">
    <failure message="Expected confirmation">AssertionError: confirmation missing</failure>
  </testcase>
</testsuite>`,
			"utf8",
		);

		expect(await runCli(["init", root], createIo().io)).toBe(0);
		expect(
			await runCli(["project", "add", "retail-web", root], createIo().io),
		).toBe(0);

		const ingestIo = createIo();
		expect(
			await runCli(
				["ingest", evidencePath, "--project", "retail-web", root],
				ingestIo.io,
			),
		).toBe(0);
		expect(ingestIo.stderr).toEqual([]);
		expect(ingestIo.stdout[0]).toContain("Ingested JUnit XML");

		const inboxFiles = await readdir(join(root, "inbox", "retail-web"));
		expect(inboxFiles).toHaveLength(1);
		const ingestionId = requireItem(
			inboxFiles[0],
			"Expected one JUnit ingestion record.",
		).replace(/\.json$/u, "");

		const draftIo = createIo();
		expect(
			await runCli(
				[
					"draft",
					"create",
					"--from",
					ingestionId,
					"--project",
					"retail-web",
					"--title",
					"Declined card guidance",
					root,
				],
				draftIo.io,
			),
		).toBe(0);
		expect(draftIo.stderr).toEqual([]);

		const draftFiles = await readdir(join(root, "drafts", "retail-web"));
		expect(draftFiles).toHaveLength(1);
		const draftId = requireItem(
			draftFiles[0],
			"Expected one JUnit draft record.",
		).replace(/\.json$/u, "");

		const approveIo = createIo();
		expect(await runCli(["approve", draftId, root], approveIo.io)).toBe(0);
		expect(approveIo.stderr).toEqual([]);

		const memoryPath = join(
			root,
			"memory",
			"client-project",
			"retail-web",
			`${draftId}.md`,
		);
		const memorySource = await readFile(memoryPath, "utf8");
		expect(memorySource).toContain("status: reviewed");
		expect(memorySource).toContain("Checkout :: declined card");
		expect(memorySource).toContain("Expected confirmation");

		expect(await runCli(["index", "rebuild", root], createIo().io)).toBe(0);

		const retrieveIo = createIo();
		expect(
			await runCli(
				[
					"retrieve",
					"--project",
					"retail-web",
					"--query",
					"declined card confirmation",
					root,
				],
				retrieveIo.io,
			),
		).toBe(0);
		expect(retrieveIo.stderr).toEqual([]);
		expect(retrieveIo.stdout).toHaveLength(1);
		expect(retrieveIo.stdout[0]).toContain(draftId);
		expect(retrieveIo.stdout[0]).toContain("client-project\treviewed");
	});
});
