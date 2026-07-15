import type { TweakManifest } from "@codex-plusplus/sdk";

export const DEFAULT_TWEAK_STORE_INDEX_URL =
  "https://b-nnett.github.io/codex-plusplus/store/index.json";
export const TWEAK_STORE_REVIEW_ISSUE_URL =
  "https://github.com/b-nnett/codex-plusplus/issues/new";

export interface TweakStoreRegistry {
  schemaVersion: 1;
  generatedAt?: string;
  entries: TweakStoreEntry[];
}

export interface TweakStoreEntry {
  id: string;
  manifest: TweakManifest;
  repo: string;
  approvedCommitSha: string;
  approvedAt: string;
  approvedBy: string;
  platforms?: TweakStorePlatform[];
  releaseUrl?: string;
  reviewUrl?: string;
}

export type TweakStorePlatform = "darwin" | "win32" | "linux";

export interface TweakStorePublishSubmission {
  repo: string;
  defaultBranch: string;
  commitSha: string;
  commitUrl: string;
  manifest?: {
    id?: string;
    name?: string;
    version?: string;
    description?: string;
    iconUrl?: string;
  };
}

const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const FULL_SHA_RE = /^[a-f0-9]{40}$/i;
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i;

export function normalizeGitHubRepo(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("GitHub repo is required");

  const ssh = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i.exec(raw);
  if (ssh) return normalizeRepoPart(ssh[1]);

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.hostname !== "github.com") throw new Error("Only github.com repositories are supported");
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) throw new Error("GitHub repo URL must include owner and repository");
    return normalizeRepoPart(`${parts[0]}/${parts[1]}`);
  }

  return normalizeRepoPart(raw);
}

export function normalizeStoreRegistry(input: unknown): TweakStoreRegistry {
  const registry = input as Partial<TweakStoreRegistry> | null;
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.entries)) {
    throw new Error("Unsupported tweak store registry");
  }
  const entries = registry.entries.map(normalizeStoreEntry);
  entries.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  return {
    schemaVersion: 1,
    generatedAt: typeof registry.generatedAt === "string" ? registry.generatedAt : undefined,
    entries,
  };
}

export function shuffleStoreEntries<T>(
  entries: readonly T[],
  randomIndex: (exclusiveMax: number) => number = (exclusiveMax) => Math.floor(Math.random() * exclusiveMax),
): T[] {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new Error(`shuffle randomIndex returned ${j}; expected an integer from 0 to ${i}`);
    }
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function normalizeStoreEntry(input: unknown): TweakStoreEntry {
  const entry = input as Partial<TweakStoreEntry> | null;
  if (!entry || typeof entry !== "object") throw new Error("Invalid tweak store entry");
  const repo = normalizeGitHubRepo(String(entry.repo ?? entry.manifest?.githubRepo ?? ""));
  const manifest = entry.manifest as TweakManifest | undefined;
  if (!manifest?.id || !manifest.name || !manifest.version) {
    throw new Error(`Store entry for ${repo} is missing manifest fields`);
  }
  if (normalizeGitHubRepo(manifest.githubRepo) !== repo) {
    throw new Error(`Store entry ${manifest.id} repo does not match manifest githubRepo`);
  }
  if (!isFullCommitSha(String(entry.approvedCommitSha ?? ""))) {
    throw new Error(`Store entry ${manifest.id} must pin a full approved commit SHA`);
  }
  return {
    id: manifest.id,
    manifest,
    repo,
    approvedCommitSha: String(entry.approvedCommitSha),
    approvedAt: typeof entry.approvedAt === "string" ? entry.approvedAt : "",
    approvedBy: typeof entry.approvedBy === "string" ? entry.approvedBy : "",
    platforms: normalizeStorePlatforms((entry as { platforms?: unknown }).platforms),
    releaseUrl: optionalGithubUrl(entry.releaseUrl),
    reviewUrl: optionalGithubUrl(entry.reviewUrl),
  };
}

export function storeArchiveUrl(entry: TweakStoreEntry): string {
  if (!isFullCommitSha(entry.approvedCommitSha)) {
    throw new Error(`Store entry ${entry.id} is not pinned to a full commit SHA`);
  }
  return `https://codeload.github.com/${entry.repo}/tar.gz/${entry.approvedCommitSha}`;
}

export function isStoreUpdateAvailable(installedVersion: string, approvedVersion: string): boolean {
  const installed = VERSION_RE.exec(installedVersion.trim());
  const approved = VERSION_RE.exec(approvedVersion.trim());
  if (!installed || !approved) return false;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(approved[i]) - Number(installed[i]);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export function buildTweakPublishIssueUrl(submission: TweakStorePublishSubmission): string {
  const repo = normalizeGitHubRepo(submission.repo);
  if (!isFullCommitSha(submission.commitSha)) {
    throw new Error("Submission must include the full commit SHA to review");
  }
  const title = `Tweak store review: ${repo}`;
  const body = [
    "## Tweak repo",
    `https://github.com/${repo}`,
    "",
    "## Commit to review",
    submission.commitSha,
    submission.commitUrl,
    "",
    "Do not approve a different commit. If the author pushes changes, ask them to resubmit.",
    "",
    "## Manifest",
    `- id: ${submission.manifest?.id ?? "(not detected)"}`,
    `- name: ${submission.manifest?.name ?? "(not detected)"}`,
    `- version: ${submission.manifest?.version ?? "(not detected)"}`,
    `- description: ${submission.manifest?.description ?? "(not detected)"}`,
    `- iconUrl: ${submission.manifest?.iconUrl ?? "(not detected)"}`,
    "",
    "## Admin checklist",
    "- [ ] manifest.json is valid",
    "- [ ] manifest.iconUrl is usable as the store icon",
    "- [ ] source was reviewed at the exact commit above",
    "- [ ] `store/index.json` entry pins `approvedCommitSha` to the exact commit above",
  ].join("\n");
  const url = new URL(TWEAK_STORE_REVIEW_ISSUE_URL);
  url.searchParams.set("template", "tweak-store-review.md");
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  return url.toString();
}

export function isFullCommitSha(value: string): boolean {
  return FULL_SHA_RE.test(value);
}

function normalizeRepoPart(value: string): string {
  const repo = value.trim().replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!GITHUB_REPO_RE.test(repo)) throw new Error("GitHub repo must be in owner/repo form");
  return repo;
}

function normalizeStorePlatforms(input: unknown): TweakStorePlatform[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new Error("Store entry platforms must be an array");
  const allowed = new Set<TweakStorePlatform>(["darwin", "win32", "linux"]);
  const platforms = Array.from(new Set(input.map((value) => {
    if (typeof value !== "string" || !allowed.has(value as TweakStorePlatform)) {
      throw new Error(`Unsupported store platform: ${String(value)}`);
    }
    return value as TweakStorePlatform;
  })));
  return platforms.length > 0 ? platforms : undefined;
}

function optionalGithubUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com") return undefined;
  return url.toString();
}
