import { describe, expect, it } from "vitest";

import {
	type MarkdownMemoryError,
	type MemoryMetadataError,
	parseMemoryMarkdown,
} from "../src/index.js";

const validMarkdown = `---
id: login-selector-failure
scope: client-project
status: reviewed
created: 2026-06-19
source_ref: sanitized-test-run-123
name: "Login selector failure"
project: retail-web
---

# Login selector failure

Use the stable data-testid selector.
`;

describe("memory Markdown parsing", () => {
	it("parses valid frontmatter and body", () => {
		expect(parseMemoryMarkdown(validMarkdown)).toEqual({
			metadata: {
				id: "login-selector-failure",
				scope: "client-project",
				status: "reviewed",
				created: "2026-06-19",
				sourceRef: "sanitized-test-run-123",
				name: "Login selector failure",
				projectAlias: "retail-web",
			},
			body: "# Login selector failure\n\nUse the stable data-testid selector.",
		});
	});

	it("rejects missing frontmatter delimiters", () => {
		expect(() => parseMemoryMarkdown("# No frontmatter")).toThrowError(
			expect.objectContaining<Partial<MarkdownMemoryError>>({
				code: "MISSING_FRONTMATTER",
				line: 1,
			}),
		);

		expect(() =>
			parseMemoryMarkdown("---\nid: missing-closing-delimiter"),
		).toThrowError(
			expect.objectContaining<Partial<MarkdownMemoryError>>({
				code: "MISSING_FRONTMATTER",
			}),
		);
	});

	it("rejects malformed frontmatter lines", () => {
		expect(() =>
			parseMemoryMarkdown(`---
id login-selector-failure
---
Body`),
		).toThrowError(
			expect.objectContaining<Partial<MarkdownMemoryError>>({
				code: "INVALID_FRONTMATTER_LINE",
				line: 2,
			}),
		);
	});

	it("rejects duplicate frontmatter fields", () => {
		expect(() =>
			parseMemoryMarkdown(`---
id: login-selector-failure
id: duplicate-id
scope: client-project
status: reviewed
created: 2026-06-19
source_ref: sanitized-test-run-123
---
Body`),
		).toThrowError(
			expect.objectContaining<Partial<MarkdownMemoryError>>({
				code: "DUPLICATE_FRONTMATTER_FIELD",
				line: 3,
			}),
		);
	});

	it("surfaces invalid metadata errors", () => {
		expect(() =>
			parseMemoryMarkdown(`---
id: Login Failure!
scope: client-project
status: reviewed
created: 2026-06-19
source_ref: sanitized-test-run-123
---
Body`),
		).toThrowError(
			expect.objectContaining<Partial<MemoryMetadataError>>({
				code: "INVALID_MEMORY_ID",
				field: "id",
			}),
		);
	});
});
