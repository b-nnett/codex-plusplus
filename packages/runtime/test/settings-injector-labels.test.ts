import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const runtimeSource = readFileSync(
  resolve(repoRoot, "packages/runtime/src/preload/settings-injector.ts"),
  "utf8",
);
const bundledPreload = readFileSync(
  resolve(repoRoot, "packages/installer/assets/runtime/preload/settings-injector.js"),
  "utf8",
);

const koreanSettingsLabels = [
  "일반",
  "외관",
  "구성",
  "기본 권한",
  "개인화",
  "키보드 단축키",
  "보관된 채팅",
  "사용량",
  "컴퓨터 사용",
  "브라우저 사용",
  "MCP 서버",
  "환경",
  "클라우드 환경",
  "작업 트리",
  "연결",
];

const koreanMainNavLabels = [
  "새 채팅",
  "빠른 채팅",
  "검색",
  "플러그인",
  "자동화",
  "채팅",
  "프로젝트",
  "고정됨",
  "설정",
  "로컬에서 작업",
];

test("source settings injector recognizes Korean Codex settings labels", () => {
  assertLabelsPresent(runtimeSource, koreanSettingsLabels);
  assertLabelsPresent(runtimeSource, koreanMainNavLabels);
});

test("bundled settings injector recognizes Korean Codex settings labels", () => {
  assertLabelsPresent(bundledPreload, koreanSettingsLabels);
  assertLabelsPresent(bundledPreload, koreanMainNavLabels);
});

function assertLabelsPresent(source: string, labels: string[]): void {
  for (const label of labels) {
    assert.ok(source.includes(label), `missing Korean label: ${label}`);
  }
}
