import { describe, expect, it } from "vitest";

import {
	type MemoryMetadataError,
	validateMemoryMetadata,
} from "../src/index.js";

const validMetadata = {
	id: "login-selector-failure",
	scope: "client-project",
	status: "reviewed",
	created: "2026-06-19",
	source_ref: "sanitized-test-run-123",
	name: "Login selector failure",
	project: "retail-web",
	last_reviewed: "2026-06-19",
};

describe("memory metadata validation", () => {
	it("accepts valid metadata", () => {
		expect(validateMemoryMetadata(validMetadata)).toEqual({
			id: "login-selector-failure",
			scope: "client-project",
			status: "reviewed",
			created: "2026-06-19",
			sourceRef: "sanitized-test-run-123",
			name: "Login selector failure",
			projectAlias: "retail-web",
			lastReviewed: "2026-06-19",
		});
	});

	it("rejects an invalid scope", () => {
		expect(() =>
			validateMemoryMetadata({ ...validMetadata, scope: "global" }),
		).toThrowError(
			expect.objectContaining<Partial<MemoryMetadataError>>({
				code: "INVALID_MEMORY_SCOPE",
				field: "scope",
			}),
		);
	});

	it("rejects an invalid status", () => {
		expect(() =>
			validateMemoryMetadata({ ...validMetadata, status: "published" }),
		).toThrowError(
			expect.objectContaining<Partial<MemoryMetadataError>>({
				code: "INVALID_MEMORY_STATUS",
				field: "status",
			}),
		);
	});

	it("rejects missing required fields", () => {
		const { source_ref: _sourceRef, ...metadataWithoutSourceRef } =
			validMetadata;

		expect(() => validateMemoryMetadata(metadataWithoutSourceRef)).toThrowError(
			expect.objectContaining<Partial<MemoryMetadataError>>({
				code: "INVALID_MEMORY_METADATA",
				field: "source_ref",
			}),
		);
	});

	it("rejects invalid IDs", () => {
		expect(() =>
			validateMemoryMetadata({ ...validMetadata, id: "Login Failure!" }),
		).toThrowError(
			expect.objectContaining<Partial<MemoryMetadataError>>({
				code: "INVALID_MEMORY_ID",
				field: "id",
			}),
		);
	});

	it("rejects invalid dates", () => {
		expect(() =>
			validateMemoryMetadata({ ...validMetadata, created: "19-06-2026" }),
		).toThrowError(
			expect.objectContaining<Partial<MemoryMetadataError>>({
				code: "INVALID_MEMORY_DATE",
				field: "created",
			}),
		);
	});
});
