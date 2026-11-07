import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	addProjectAlias,
	ingestPlainText,
	initializeWorkspace,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-ingestion-"));
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

describe("plain-text ingestion", () => {
	it("stores a normalized ingestion record", async () => {
		const config = await createWorkspace();

		const stored = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "  Assertion failed  ",
		});

		const persisted = JSON.parse(await readFile(stored.path, "utf8")) as {
			id: string;
			projectAlias: string;
			sourceType: string;
			sourceRef: string;
			content: string;
			createdAt: string;
		};

		expect(stored.path).toBe(
			join(config.inboxRoot, "retail-web", `${stored.record.id}.json`),
		);
		expect(persisted).toEqual(stored.record);
		expect(persisted.projectAlias).toBe("retail-web");
		expect(persisted.sourceType).toBe("plain-text");
		expect(persisted.content).toBe("Assertion failed");
	});

	it("rejects unknown projects", async () => {
		const config = await createWorkspace();

		await expect(
			ingestPlainText(config, {
				projectAlias: "api-tests",
				sourceRef: "failure.log",
				content: "Assertion failed",
			}),
		).rejects.toMatchObject({ code: "PROJECT_ALIAS_NOT_FOUND" });
	});

	it("rejects invalid project aliases", async () => {
		const config = await createWorkspace();

		await expect(
			ingestPlainText(config, {
				projectAlias: "Client Name!",
				sourceRef: "failure.log",
				content: "Assertion failed",
			}),
		).rejects.toMatchObject({ code: "INVALID_PROJECT_ALIAS" });
	});

	it("rejects empty content", async () => {
		const config = await createWorkspace();

		await expect(
			ingestPlainText(config, {
				projectAlias: "retail-web",
				sourceRef: "failure.log",
				content: "   \r\n  ",
			}),
		).rejects.toMatchObject({ code: "INVALID_INGESTION_INPUT" });
	});

	it("stores only a safe source file name", async () => {
		const config = await createWorkspace();

		const stored = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "/private/client/builds/failure.log",
			content: "Assertion failed",
		});

		expect(stored.record.sourceRef).toBe("failure.log");
	});

	it("normalizes Windows line endings", async () => {
		const config = await createWorkspace();

		const stored = await ingestPlainText(config, {
			projectAlias: "retail-web",
			sourceRef: "failure.log",
			content: "line one\r\nline two\r\n",
		});

		expect(stored.record.content).toBe("line one\nline two");
	});
});
