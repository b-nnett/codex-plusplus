import { chownSync, existsSync, lchownSync, lstatSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform, userInfo } from "node:os";
import { join } from "node:path";

export interface UserOwnership {
  uid: number;
  gid: number;
}

interface OwnershipInput {
  currentUid: number | null;
  currentGid: number | null;
  sudoUid?: string;
  sudoGid?: string;
  homeOwner?: UserOwnership | null;
}

export function targetUserOwnership(): UserOwnership | null {
  if (platform() === "win32") return null;
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  const currentGid = typeof process.getgid === "function" ? process.getgid() : null;
  return resolveTargetUserOwnership({
    currentUid,
    currentGid,
    sudoUid: process.env.SUDO_UID,
    sudoGid: process.env.SUDO_GID,
    homeOwner: homeDirectoryOwner(),
  });
}

export function targetUserHome(): string {
  if (platform() === "win32") return homedir();

  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  return resolveTargetUserHome({
    currentUid,
    sudoUser: process.env.SUDO_USER,
    fallbackHome: homedir(),
    lookupHome: resolveUserHome,
  });
}

export function resolveTargetUserHome(input: {
  currentUid: number | null;
  sudoUser?: string;
  fallbackHome: string;
  lookupHome: (username: string) => string | null;
}): string {
  if (input.currentUid !== 0) return input.fallbackHome;

  const sudoUser = input.sudoUser;
  if (!sudoUser || sudoUser === "root") return input.fallbackHome;

  return input.lookupHome(sudoUser) ?? input.fallbackHome;
}

export function resolveTargetUserOwnership(input: OwnershipInput): UserOwnership | null {
  if (input.currentUid === null) return null;
  if (input.currentUid === 0) {
    const sudoUid = parsePositiveInt(input.sudoUid);
    if (sudoUid !== null) {
      return {
        uid: sudoUid,
        gid: parseNonNegativeInt(input.sudoGid) ?? input.homeOwner?.gid ?? sudoUid,
      };
    }
    if (input.homeOwner && input.homeOwner.uid > 0) return input.homeOwner;
  }

  return {
    uid: input.currentUid,
    gid: input.currentGid ?? safeUserInfoGid() ?? input.currentUid,
  };
}

export function chownForTargetUser(path: string, opts: { recursive?: boolean } = {}): void {
  const owner = targetUserOwnership();
  if (!owner || !existsSync(path)) return;
  chownPath(path, owner, opts.recursive === true);
}

function chownPath(path: string, owner: UserOwnership, recursive: boolean): void {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return;
  }

  if (recursive && st.isDirectory() && !st.isSymbolicLink()) {
    try {
      for (const name of readdirSync(path)) {
        chownPath(join(path, name), owner, true);
      }
    } catch {
      // Ownership normalization is best-effort. If the directory becomes
      // unreadable while recursing, skip its children and continue.
    }
  }

  if (st.uid === owner.uid && st.gid === owner.gid) return;
  try {
    if (st.isSymbolicLink()) {
      lchownSync(path, owner.uid, owner.gid);
    } else {
      chownSync(path, owner.uid, owner.gid);
    }
  } catch {
    // Ownership normalization is best-effort. The installer will still surface
    // real read/write failures at the operation that needs the file.
  }
}

function homeDirectoryOwner(): UserOwnership | null {
  try {
    const st = statSync(homedir());
    return { uid: st.uid, gid: st.gid };
  } catch {
    return null;
  }
}

function resolveUserHome(username: string): string | null {
  try {
    if (platform() === "darwin") {
      const out = execFileSync("dscl", [".", "-read", `/Users/${username}`, "NFSHomeDirectory"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const home = out.match(/\bNFSHomeDirectory:\s*(.+)\s*$/m)?.[1]?.trim();
      return home || null;
    }
    const out = execFileSync("getent", ["passwd", username], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split(":")[5] || null;
  } catch {
    return null;
  }
}

function safeUserInfoGid(): number | null {
  try {
    const gid = userInfo().gid;
    return typeof gid === "number" && gid >= 0 ? gid : null;
  } catch {
    return null;
  }
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
