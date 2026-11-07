import {
	MemoryMetadataError,
	validateMemoryMetadata,
	type MemoryEntryMetadata,
} from "./metadata.js";

export type MarkdownMemoryErrorCode =
	| "MISSING_FRONTMATTER"
	| "INVALID_FRONTMATTER_LINE"
	| "DUPLICATE_FRONTMATTER_FIELD";

export class MarkdownMemoryError extends Error {
	public readonly code: MarkdownMemoryErrorCode;
	public readonly line: number | undefined;

	public constructor(
		code: MarkdownMemoryErrorCode,
		message: string,
		line?: number,
	) {
		super(message);
		this.name = "MarkdownMemoryError";
		this.code = code;
		this.line = line;
	}
}

export interface ParsedMemoryMarkdown {
	metadata: MemoryEntryMetadata;
	body: string;
}

function parseScalar(value: string): string {
	const trimmed = value.trim();

	if (
		trimmed.length >= 2 &&
		((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'")))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

function parseFrontmatter(lines: readonly string[]): Record<string, string> {
	const metadata: Record<string, string> = {};

	for (const [index, rawLine] of lines.entries()) {
		const lineNumber = index + 2;
		const line = rawLine.trim();

		if (line === "" || line.startsWith("#")) {
			continue;
		}

		const separatorIndex = line.indexOf(":");
		if (separatorIndex <= 0) {
			throw new MarkdownMemoryError(
				"INVALID_FRONTMATTER_LINE",
				`Frontmatter line ${lineNumber} must use 'key: value' format.`,
				lineNumber,
			);
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = parseScalar(line.slice(separatorIndex + 1));

		if (key === "" || value === "") {
			throw new MarkdownMemoryError(
				"INVALID_FRONTMATTER_LINE",
				`Frontmatter line ${lineNumber} must contain a non-empty key and value.`,
				lineNumber,
			);
		}

		if (Object.hasOwn(metadata, key)) {
			throw new MarkdownMemoryError(
				"DUPLICATE_FRONTMATTER_FIELD",
				`Frontmatter field '${key}' is duplicated on line ${lineNumber}.`,
				lineNumber,
			);
		}

		metadata[key] = value;
	}

	return metadata;
}

export function parseMemoryMarkdown(source: string): ParsedMemoryMarkdown {
	const normalized = source.replaceAll("\r\n", "\n");
	const lines = normalized.split("\n");

	if (lines[0]?.trim() !== "---") {
		throw new MarkdownMemoryError(
			"MISSING_FRONTMATTER",
			"Memory Markdown must begin with a frontmatter delimiter ('---').",
			1,
		);
	}

	const closingIndex = lines.findIndex(
		(line, index) => index > 0 && line.trim() === "---",
	);

	if (closingIndex === -1) {
		throw new MarkdownMemoryError(
			"MISSING_FRONTMATTER",
			"Memory Markdown frontmatter is missing its closing delimiter ('---').",
		);
	}

	const rawMetadata = parseFrontmatter(lines.slice(1, closingIndex));

	try {
		return {
			metadata: validateMemoryMetadata(rawMetadata),
			body: lines
				.slice(closingIndex + 1)
				.join("\n")
				.trim(),
		};
	} catch (error) {
		if (error instanceof MemoryMetadataError) {
			throw error;
		}

		throw error;
	}
}
