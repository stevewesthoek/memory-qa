import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeWorkspace, storeReviewedMemory } from "memory-qa-core";
import { runCli, type CliIo } from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "prochat-cli-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createIo(): {
	io: CliIo;
	stdout: string[];
	stderr: string[];
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

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("Memory QA CLI", () => {
	it("prints help for --help", async () => {
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["--help"], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toHaveLength(1);
		expect(stdout[0]).toMatch(/^Usage:/);
	});

	it("prints help for -h", async () => {
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["-h"], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toHaveLength(1);
		expect(stdout[0]).toMatch(/^Usage:/);
	});

	it("keeps unknown commands invalid", async () => {
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["unknown"], io);

		expect(exitCode).toBe(1);
		expect(stdout).toEqual([]);
		expect(stderr).toHaveLength(1);
		expect(stderr[0]).toMatch(/^Usage:/);
	});

	it("initializes a workspace", async () => {
		const root = await createTemporaryDirectory();
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["init", root], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toEqual([`Initialized Memory QA at ${root}`]);
		expect(await readFile(join(root, "workspace.json"), "utf8")).toContain(
			'"version": 1',
		);
	});

	it("adds a project alias", async () => {
		const root = await createTemporaryDirectory();
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["project", "add", "retail-web", root], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toEqual(["Added project alias 'retail-web'."]);
	});

	it("lists project aliases", async () => {
		const root = await createTemporaryDirectory();
		await runCli(["project", "add", "retail-web", root], createIo().io);
		await runCli(["project", "add", "api-tests", root], createIo().io);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["project", "list", root], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toEqual(["api-tests", "retail-web"]);
	});

	it("rebuilds the SQLite index from reviewed Markdown", async () => {
		const root = await createTemporaryDirectory();
		const config = await initializeWorkspace(root);
		await storeReviewedMemory(
			config,
			{
				id: "login-selector-failure",
				scope: "client-project",
				status: "reviewed",
				created: "2026-06-19",
				source_ref: "sanitized-test-run-123",
				project: "retail-web",
			},
			"Use the stable data-testid selector.",
		);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["index", "rebuild", root], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toEqual(["Rebuilt memory index with 1 Markdown file."]);
		expect(await readFile(config.indexFile)).not.toHaveLength(0);
	});

	it("reports an empty index rebuild", async () => {
		const root = await createTemporaryDirectory();
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["index", "rebuild", root], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toEqual(["Rebuilt memory index with 0 Markdown files."]);
	});
});

describe("Memory QA ingest CLI", () => {
	it("ingests a plain-text file for a configured project", async () => {
		const root = await createTemporaryDirectory();
		const sourceFile = join(root, "failure.log");
		const { writeFile, readdir } = await import("node:fs/promises");
		await writeFile(
			sourceFile,
			"Assertion failed\r\nExpected visible\r\n",
			"utf8",
		);
		await runCli(["project", "add", "retail-web", root], createIo().io);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			["ingest", sourceFile, "--project", "retail-web", root],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout[0]).toMatch(/^Ingested plain text as '[0-9a-f-]+'.$/);

		const files = await readdir(join(root, "inbox", "retail-web"));
		expect(files).toHaveLength(1);
		const record = JSON.parse(
			await readFile(
				join(root, "inbox", "retail-web", files[0] as string),
				"utf8",
			),
		) as { sourceRef: string; content: string };
		expect(record).toMatchObject({
			sourceRef: "failure.log",
			content: "Assertion failed\nExpected visible",
		});
	});

	it("rejects invalid ingest command syntax", async () => {
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["ingest", "failure.log"], io);

		expect(exitCode).toBe(1);
		expect(stdout).toEqual([]);
		expect(stderr[0]).toContain("Invalid ingest command.");
	});
});

describe("Memory QA ingest file-type routing", () => {
	it("routes .xml files to JUnit ingestion", async () => {
		const root = await createTemporaryDirectory();
		const sourceFile = join(root, "junit.xml");
		const { writeFile, readdir } = await import("node:fs/promises");
		await writeFile(
			sourceFile,
			`<testsuite><testcase classname="Checkout" name="declined card"><failure message="Expected confirmation">Assertion failed</failure></testcase></testsuite>`,
			"utf8",
		);
		await runCli(["project", "add", "retail-web", root], createIo().io);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			["ingest", sourceFile, "--project", "retail-web", root],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout[0]).toMatch(/^Ingested JUnit XML as '[0-9a-f-]+'.$/);

		const files = await readdir(join(root, "inbox", "retail-web"));
		expect(files).toHaveLength(1);
		const record = JSON.parse(
			await readFile(
				join(root, "inbox", "retail-web", files[0] as string),
				"utf8",
			),
		) as { sourceType: string; content: string };
		expect(record.sourceType).toBe("junit-xml");
		expect(record.content).toContain("Checkout :: declined card");
	});

	it("keeps non-XML files on plain-text ingestion", async () => {
		const root = await createTemporaryDirectory();
		const sourceFile = join(root, "failure.txt");
		const { writeFile, readdir } = await import("node:fs/promises");
		await writeFile(
			sourceFile,
			"Assertion failed\r\nExpected visible\r\n",
			"utf8",
		);
		await runCli(["project", "add", "retail-web", root], createIo().io);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			["ingest", sourceFile, "--project", "retail-web", root],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout[0]).toMatch(/^Ingested plain text as '[0-9a-f-]+'.$/);

		const files = await readdir(join(root, "inbox", "retail-web"));
		expect(files).toHaveLength(1);
		const record = JSON.parse(
			await readFile(
				join(root, "inbox", "retail-web", files[0] as string),
				"utf8",
			),
		) as { sourceType: string; content: string };
		expect(record).toMatchObject({
			sourceType: "plain-text",
			content: "Assertion failed\nExpected visible",
		});
	});
});

describe("prochat retrieve CLI", () => {
	it("prints matching memory results", async () => {
		const root = await createTemporaryDirectory();
		const config = await initializeWorkspace(root);
		await storeReviewedMemory(
			config,
			{
				id: "checkout-timeout",
				scope: "client-project",
				status: "reviewed",
				created: "2026-06-19",
				source_ref: "checkout.log",
				project: "retail-web",
			},
			"Checkout timeout after deployment.",
		);
		await runCli(["index", "rebuild", root], createIo().io);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			[
				"retrieve",
				"--project",
				"retail-web",
				"--query",
				"checkout timeout",
				root,
			],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toHaveLength(1);
		expect(stdout[0]).toContain("checkout-timeout\tclient-project\treviewed");
		expect(stdout[0]).toContain("Matched checkout, timeout");
	});

	it("reports no matching memory", async () => {
		const root = await createTemporaryDirectory();
		await runCli(["index", "rebuild", root], createIo().io);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			["retrieve", "--project", "retail-web", "--query", "missing", root],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toEqual(["No matching memory found."]);
	});

	it("rejects invalid retrieve syntax", async () => {
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["retrieve", "--project", "retail-web"], io);

		expect(exitCode).toBe(1);
		expect(stdout).toEqual([]);
		expect(stderr[0]).toContain("Invalid retrieve command.");
	});

	it("keeps client-project retrieval isolated", async () => {
		const root = await createTemporaryDirectory();
		const config = await initializeWorkspace(root);
		await storeReviewedMemory(
			config,
			{
				id: "retail-selector",
				scope: "client-project",
				status: "reviewed",
				created: "2026-06-19",
				source_ref: "retail.log",
				project: "retail-web",
			},
			"Selector timeout guidance.",
		);
		await storeReviewedMemory(
			config,
			{
				id: "api-selector",
				scope: "client-project",
				status: "reviewed",
				created: "2026-06-19",
				source_ref: "api.log",
				project: "api-tests",
			},
			"Selector timeout guidance.",
		);
		await runCli(["index", "rebuild", root], createIo().io);
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			["retrieve", "--project", "retail-web", "--query", "selector", root],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout.some((line) => line.includes("retail-selector"))).toBe(true);
		expect(stdout.some((line) => line.includes("api-selector"))).toBe(false);
	});
});

describe("prochat draft and approval CLI", () => {
	it("creates a draft from an ingestion record", async () => {
		const root = await createTemporaryDirectory();
		const {
			addProjectAlias,
			ingestPlainText,
			initializeWorkspace: initializeCoreWorkspace,
		} = await import("memory-qa-core");
		const config = await initializeCoreWorkspace(root);
		await addProjectAlias(config, "retail-web");
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "Checkout timeout after deployment.",
		});
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			[
				"draft",
				"create",
				"--from",
				ingestion.record.id,
				"--project",
				"retail-web",
				"--title",
				"Checkout timeout guidance",
				root,
			],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout[0]).toMatch(/^Created draft '[0-9a-f-]+'.$/);
	});

	it("prints sanitization warnings after draft creation", async () => {
		const root = await createTemporaryDirectory();
		const {
			addProjectAlias,
			ingestPlainText,
			initializeWorkspace: initializeCoreWorkspace,
		} = await import("memory-qa-core");
		const config = await initializeCoreWorkspace(root);
		await addProjectAlias(config, "retail-web");
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "token=secret-value",
		});
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(
			[
				"draft",
				"create",
				"--from",
				ingestion.record.id,
				"--project",
				"retail-web",
				"--title",
				"Unsafe evidence",
				root,
			],
			io,
		);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout).toContain(
			"WARNING: Evidence may contain credentials or secret material.",
		);
	});

	it("rejects invalid draft create syntax", async () => {
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["draft", "create", "--from"], io);

		expect(exitCode).toBe(1);
		expect(stdout).toEqual([]);
		expect(stderr[0]).toContain("Invalid draft create command.");
	});

	it("approves a draft and writes reviewed Markdown", async () => {
		const root = await createTemporaryDirectory();
		const {
			addProjectAlias,
			createDraftFromIngestion,
			ingestPlainText,
			initializeWorkspace: initializeCoreWorkspace,
		} = await import("memory-qa-core");
		const config = await initializeCoreWorkspace(root);
		await addProjectAlias(config, "retail-web");
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "Checkout timeout after deployment.",
		});
		const draft = await createDraftFromIngestion(config, {
			ingestionId: ingestion.record.id,
			projectAlias: "retail-web",
			title: "Checkout timeout guidance",
		});
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["approve", draft.draft.id, root], io);

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout[0]).toBe(`Approved draft '${draft.draft.id}'.`);
		const memoryPath = join(
			config.memoryRoot,
			"client-project",
			"retail-web",
			`${draft.draft.id}.md`,
		);
		expect(await readFile(memoryPath, "utf8")).toContain("status: reviewed");
	});

	it("reports missing drafts during approval", async () => {
		const root = await createTemporaryDirectory();
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["approve", "missing-draft", root], io);

		expect(exitCode).toBe(1);
		expect(stdout).toEqual([]);
		expect(stderr[0]).toContain("INVALID_DRAFT");
	});

	it("blocks approval while sanitization warnings remain", async () => {
		const root = await createTemporaryDirectory();
		const {
			addProjectAlias,
			createDraftFromIngestion,
			ingestPlainText,
			initializeWorkspace: initializeCoreWorkspace,
		} = await import("memory-qa-core");
		const config = await initializeCoreWorkspace(root);
		await addProjectAlias(config, "retail-web");
		const ingestion = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "token=secret-value",
		});
		const draft = await createDraftFromIngestion(config, {
			ingestionId: ingestion.record.id,
			projectAlias: "retail-web",
			title: "Unsafe evidence",
		});
		const { io, stdout, stderr } = createIo();

		const exitCode = await runCli(["approve", draft.draft.id, root], io);

		expect(exitCode).toBe(1);
		expect(stdout).toEqual([]);
		expect(stderr[0]).toContain("APPROVAL_REQUIRED");
	});
});
