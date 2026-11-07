import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	addProjectAlias,
	ingestJUnitXml,
	initializeWorkspace,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-junit-ingestion-"));
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

describe("JUnit XML ingestion", () => {
	it("stores normalized failed and errored test cases", async () => {
		const config = await createWorkspace();
		const xml = `<?xml version="1.0"?>
<testsuite name="checkout" tests="3" failures="1" errors="1">
  <testcase classname="Checkout" name="successful purchase" />
  <testcase classname="Checkout" name="declined card">
    <failure message="Expected confirmation">AssertionError: confirmation missing</failure>
  </testcase>
  <testcase classname="Checkout" name="service error">
    <error message="HTTP 500">Request failed &lt;server&gt;</error>
  </testcase>
</testsuite>`;

		const stored = await ingestJUnitXml(config, {
			projectAlias: "retail-web",
			sourceRef: "/private/builds/junit.xml",
			xml,
		});

		expect(stored.record.sourceType).toBe("junit-xml");
		expect(stored.record.sourceRef).toBe("junit.xml");
		expect(stored.record.content).toContain("Checkout :: declined card");
		expect(stored.record.content).toContain("Expected confirmation");
		expect(stored.record.content).toContain("Checkout :: service error");
		expect(stored.record.content).toContain("Request failed <server>");

		const persisted = JSON.parse(await readFile(stored.path, "utf8"));
		expect(persisted).toEqual(stored.record);
	});

	it("rejects malformed non-JUnit input", async () => {
		const config = await createWorkspace();

		await expect(
			ingestJUnitXml(config, {
				projectAlias: "retail-web",
				sourceRef: "junit.xml",
				xml: "not xml",
			}),
		).rejects.toMatchObject({ code: "INVALID_INGESTION_INPUT" });
	});

	it("rejects JUnit XML without failures", async () => {
		const config = await createWorkspace();

		await expect(
			ingestJUnitXml(config, {
				projectAlias: "retail-web",
				sourceRef: "junit.xml",
				xml: `<testsuite tests="1"><testcase name="passes" /></testsuite>`,
			}),
		).rejects.toMatchObject({ code: "INVALID_INGESTION_INPUT" });
	});

	it("rejects unknown projects", async () => {
		const config = await createWorkspace();

		await expect(
			ingestJUnitXml(config, {
				projectAlias: "api-tests",
				sourceRef: "junit.xml",
				xml: `<testsuite><testcase name="fails"><failure>boom</failure></testcase></testsuite>`,
			}),
		).rejects.toMatchObject({ code: "PROJECT_ALIAS_NOT_FOUND" });
	});
});
