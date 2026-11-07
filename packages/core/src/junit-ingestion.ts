import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
	DomainError,
	listProjectAliases,
	validateProjectAlias,
	type IngestionRecord,
	type WorkspaceConfig,
} from "./index.js";

export interface JUnitIngestionInput {
	readonly projectAlias: string;
	readonly sourceRef: string;
	readonly xml: string;
}

export interface StoredJUnitIngestionRecord {
	readonly record: IngestionRecord;
	readonly path: string;
}

function decodeXml(value: string): string {
	return value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
}

function extractAttribute(source: string, name: string): string | undefined {
	const match = source.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`));
	return match?.[1] === undefined ? undefined : decodeXml(match[1]);
}

function normalizeJUnitFailures(xml: string): string {
	const normalized = xml.replaceAll("\r\n", "\n").trim();

	if (
		normalized === "" ||
		(!normalized.includes("<testsuite") && !normalized.includes("<testsuites"))
	) {
		throw new DomainError(
			"INVALID_INGESTION_INPUT",
			"JUnit ingestion requires valid testsuite XML.",
			{ field: "xml" },
		);
	}

	const failures: string[] = [];
	const testcasePattern = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;
	const nonSelfClosingTestcases = normalized.replace(
		/<testcase\b[^>]*\/>/g,
		"",
	);

	for (const match of nonSelfClosingTestcases.matchAll(testcasePattern)) {
		const attributes = match[1] ?? "";
		const body = match[2] ?? "";
		const failureMatch = body.match(
			/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/,
		);

		if (failureMatch === null) {
			continue;
		}

		const name = extractAttribute(attributes, "name") ?? "unnamed test";
		const className = extractAttribute(attributes, "classname");
		const message = extractAttribute(failureMatch[2] ?? "", "message");
		const details = decodeXml((failureMatch[3] ?? "").trim());
		const label = className === undefined ? name : `${className} :: ${name}`;
		const lines = [`Test: ${label}`];

		if (message !== undefined && message.trim() !== "") {
			lines.push(`Message: ${message.trim()}`);
		}
		if (details !== "") {
			lines.push(details);
		}

		failures.push(lines.join("\n"));
	}

	if (failures.length === 0) {
		throw new DomainError(
			"INVALID_INGESTION_INPUT",
			"JUnit XML contains no failed or errored test cases.",
			{ field: "xml" },
		);
	}

	return failures.join("\n\n");
}

export async function ingestJUnitXml(
	config: WorkspaceConfig,
	input: JUnitIngestionInput,
): Promise<StoredJUnitIngestionRecord> {
	const projectAlias = validateProjectAlias(input.projectAlias);
	const projects = await listProjectAliases(config);

	if (!projects.some((project) => project.alias === projectAlias)) {
		throw new DomainError(
			"PROJECT_ALIAS_NOT_FOUND",
			`Project alias '${projectAlias}' is not configured.`,
			{ projectAlias },
		);
	}

	const sourceRef = basename(input.sourceRef.trim());
	if (sourceRef === "" || sourceRef === "." || sourceRef.length > 256) {
		throw new DomainError(
			"INVALID_INGESTION_INPUT",
			"The ingestion source reference must be a non-empty file name no longer than 256 characters.",
			{ field: "sourceRef" },
		);
	}

	const record: IngestionRecord = {
		id: randomUUID(),
		projectAlias,
		sourceType: "junit-xml",
		sourceRef,
		content: normalizeJUnitFailures(input.xml),
		createdAt: new Date().toISOString(),
	};
	const directory = join(config.inboxRoot, projectAlias);
	const path = join(directory, `${record.id}.json`);

	await mkdir(directory, { recursive: true });
	await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx",
	});

	return { record, path };
}
