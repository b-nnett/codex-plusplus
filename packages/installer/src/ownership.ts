import { chownSync, existsSync, lchownSync, lstatSync, readdirSync, statSync } from "node:fs";
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

export function resolveTargetUserOwnership(input: OwnershipInput): UserOwnership | null {
  if (input.currentUid === null) return null;
  if (input.currentUid === 0) {
    const sudoUid = parsePositiveInt(input.sudoUid);
    if (sudoUid !== null) {
      return {
        uid: sudoUid,
        gid: parsePositiveInt(input.sudoGid) ?? input.homeOwner?.gid ?? sudoUid,
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
    for (const name of readdirSync(path)) {
      chownPath(join(path, name), owner, true);
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
