import kleur from "kleur";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { extract as extractTar } from "tar";
import { chownForTargetUser } from "./ownership.js";

export interface DefaultTweak {
  id: string;
  repo: string;
  assetPattern?: RegExp;
}

export const DEFAULT_TWEAKS: DefaultTweak[] = [
  {
    id: "co.bennett.custom-keyboard-shortcuts",
    repo: "b-nnett/codex-plusplus-keyboard-shortcuts",
  },
  {
    id: "co.bennett.ui-improvements",
    repo: "b-nnett/codex-plusplus-bennett-ui",
  },
];

interface GithubRelease {
  tag_name?: string;
  tarball_url?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
}

export async function installDefaultTweaks(
  tweaksDir: string,
  step: (msg: string) => void,
): Promise<void> {
  for (const tweak of DEFAULT_TWEAKS) {
    const target = join(tweaksDir, tweak.id);
    if (existsSync(target)) {
      step(`Default tweak already installed: ${kleur.dim(tweak.id)}`);
      continue;
    }

    try {
      await installDefaultTweak(tweak, target);
      step(`Installed default tweak: ${kleur.cyan(tweak.id)}`);
    } catch (e) {
      console.warn(
        kleur.yellow(
          `Default tweak install skipped (${tweak.id}): ${(e as Error).message}`,
        ),
      );
    }
  }
}

async function installDefaultTweak(tweak: DefaultTweak, target: string): Promise<void> {
  const release = await fetchLatestRelease(tweak.repo);
  const url = selectAssetUrl(release, tweak);
  const work = mkdtempSync(join(tmpdir(), "codexpp-tweak-"));
  const archive = join(work, basename(new URL(url).pathname) || "tweak.tgz");
  const extractDir = join(work, "extract");

  try {
    await download(url, archive);
    mkdirSync(extractDir, { recursive: true });
    await extractTar({ file: archive, cwd: extractDir });
    const source = findTweakRoot(extractDir) ?? findTweakRoot(work);
    if (!source) throw new Error("release did not contain manifest.json");
    await copyDir(source, target);
    chownForTargetUser(target, { recursive: true });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function fetchLatestRelease(repo: string): Promise<GithubRelease> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "codex-plusplus-installer",
    },
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  return await res.json() as GithubRelease;
}

function selectAssetUrl(release: GithubRelease, tweak: DefaultTweak): string {
  const assets = release.assets ?? [];
  const pattern = tweak.assetPattern ?? /\.(tgz|tar\.gz)$/i;
  const asset = assets.find((a) => a.name && pattern.test(a.name) && a.browser_download_url);
  if (asset?.browser_download_url) return asset.browser_download_url;
  if (release.tarball_url) return release.tarball_url;
  throw new Error("latest release has no tarball asset");
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: { "User-Agent": "codex-plusplus-installer" },
    redirect: "follow",
  });
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
}

function findTweakRoot(dir: string): string | null {
  if (!existsSync(dir)) return null;
  if (existsSync(join(dir, "manifest.json"))) return dir;
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    if (!statSync(child).isDirectory()) continue;
    const found = findTweakRoot(child);
    if (found) return found;
  }
  return null;
}

async function copyDir(from: string, to: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.cp(from, to, {
    recursive: true,
    filter: (src) => !/\/(?:\.git|node_modules)(?:\/|$)/.test(src),
  });
}
