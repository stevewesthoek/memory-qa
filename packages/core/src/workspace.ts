import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
	ProjectAliasError,
	WorkspaceError,
	type ProjectAlias,
	type WorkspaceConfig,
} from "./index.js";

const CONFIG_FILE = "workspace.json";
const PROJECTS_FILE = "projects.json";
const ALIAS_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ProjectStore {
	version: 1;
	projects: ProjectAlias[];
}

function buildConfig(workspaceRoot: string): WorkspaceConfig {
	return {
		version: 1,
		workspaceRoot,
		projectsFile: join(workspaceRoot, PROJECTS_FILE),
		memoryRoot: join(workspaceRoot, "memory"),
		inboxRoot: join(workspaceRoot, "inbox"),
		draftsRoot: join(workspaceRoot, "drafts"),
		indexFile: join(workspaceRoot, ".prochat", "index.sqlite"),
	};
}

async function writeFileIfMissing(
	path: string,
	content: string,
): Promise<void> {
	try {
		await writeFile(path, content, { encoding: "utf8", flag: "wx" });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			throw error;
		}
	}
}

async function readProjectStore(
	config: WorkspaceConfig,
): Promise<ProjectStore> {
	try {
		const content = await readFile(config.projectsFile, "utf8");
		const parsed = JSON.parse(content) as ProjectStore;

		if (parsed.version !== 1 || !Array.isArray(parsed.projects)) {
			throw new Error("Invalid project store shape.");
		}

		return parsed;
	} catch (error) {
		if (error instanceof SyntaxError || error instanceof Error) {
			throw new WorkspaceError(
				"INVALID_WORKSPACE_CONFIG",
				`Unable to read project aliases from ${config.projectsFile}.`,
				{ cause: error.message },
			);
		}

		throw error;
	}
}

export async function initializeWorkspace(
	root: string,
): Promise<WorkspaceConfig> {
	const workspaceRoot = resolve(root);
	const config = buildConfig(workspaceRoot);

	await mkdir(workspaceRoot, { recursive: true });
	await Promise.all([
		mkdir(config.memoryRoot, { recursive: true }),
		mkdir(config.inboxRoot, { recursive: true }),
		mkdir(config.draftsRoot, { recursive: true }),
		mkdir(join(workspaceRoot, ".prochat"), { recursive: true }),
	]);

	await writeFileIfMissing(
		join(workspaceRoot, CONFIG_FILE),
		`${JSON.stringify(config, null, 2)}\n`,
	);
	await writeFileIfMissing(
		config.projectsFile,
		`${JSON.stringify({ version: 1, projects: [] } satisfies ProjectStore, null, 2)}\n`,
	);
	await writeFileIfMissing(
		join(workspaceRoot, ".gitignore"),
		[
			"# Memory QA local and sensitive artifacts",
			".prochat/",
			"inbox/",
			"drafts/",
			"*.log",
			"*.trace",
			"*.zip",
			"*.env",
			"*.secret",
			"",
		].join("\n"),
	);

	return config;
}

export function validateProjectAlias(alias: string): string {
	const normalized = alias.trim().toLowerCase();

	if (!ALIAS_PATTERN.test(normalized) || normalized.length > 64) {
		throw new ProjectAliasError(
			"INVALID_PROJECT_ALIAS",
			"Project aliases must use lowercase letters, numbers, and single hyphens, with a maximum length of 64 characters.",
			{ alias },
		);
	}

	return normalized;
}

export async function listProjectAliases(
	config: WorkspaceConfig,
): Promise<readonly ProjectAlias[]> {
	const store = await readProjectStore(config);
	return [...store.projects].sort((left, right) =>
		left.alias.localeCompare(right.alias),
	);
}

export async function addProjectAlias(
	config: WorkspaceConfig,
	alias: string,
	details: Pick<ProjectAlias, "displayName" | "description"> = {},
): Promise<ProjectAlias> {
	const normalized = validateProjectAlias(alias);
	const store = await readProjectStore(config);

	if (store.projects.some((project) => project.alias === normalized)) {
		throw new ProjectAliasError(
			"PROJECT_ALIAS_ALREADY_EXISTS",
			`Project alias '${normalized}' already exists.`,
			{ alias: normalized },
		);
	}

	const project: ProjectAlias = {
		alias: normalized,
		createdAt: new Date().toISOString(),
		...details,
	};

	const updated: ProjectStore = {
		version: 1,
		projects: [...store.projects, project],
	};

	await writeFile(
		config.projectsFile,
		`${JSON.stringify(updated, null, 2)}\n`,
		"utf8",
	);
	return project;
}
