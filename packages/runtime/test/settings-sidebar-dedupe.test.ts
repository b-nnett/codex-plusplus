import assert from "node:assert/strict";
import test from "node:test";
import {
  selectInjectedSettingsGroupsToRemove,
  type InjectedSettingsGroupCandidate,
} from "../src/preload/settings-sidebar-dedupe";

test("dedupe removes repeated injected groups from the same sidebar slot", () => {
  const sidebar = group("settings-sidebar");
  const firstNav = group("first-nav");
  const duplicateNav = group("duplicate-nav");
  const firstPages = group("first-pages");
  const duplicatePages = group("duplicate-pages");
  const invalidNav = group("invalid-nav");

  const toRemove = selectInjectedSettingsGroupsToRemove([
    candidate(firstNav, "nav-group", sidebar),
    candidate(duplicateNav, "nav-group", sidebar),
    candidate(firstPages, "pages-group", sidebar),
    candidate(duplicatePages, "pages-group", sidebar),
    candidate(invalidNav, "nav-group", sidebar, { validPlacement: false }),
  ]);

  assert.deepEqual(toRemove, [duplicateNav, duplicatePages, invalidNav]);
});

test("dedupe keeps the current state group when repeated groups exist", () => {
  const sidebar = group("settings-sidebar");
  const staleNav = group("stale-nav");
  const currentNav = group("current-nav");
  const otherSidebar = group("other-sidebar");
  const otherNav = group("other-nav");

  const toRemove = selectInjectedSettingsGroupsToRemove([
    candidate(staleNav, "nav-group", sidebar),
    candidate(currentNav, "nav-group", sidebar, { current: true }),
    candidate(otherNav, "nav-group", otherSidebar),
  ]);

  assert.deepEqual(toRemove, [staleNav]);
});

function group(id: string): { id: string } {
  return { id };
}

function candidate(
  group: { id: string },
  kind: InjectedSettingsGroupCandidate<{ id: string }>["kind"],
  parent: { id: string },
  opts: Partial<Pick<InjectedSettingsGroupCandidate<{ id: string }>, "current" | "validPlacement">> = {},
): InjectedSettingsGroupCandidate<{ id: string }> {
  return {
    group,
    kind,
    parent,
    current: opts.current ?? false,
    validPlacement: opts.validPlacement ?? true,
  };
}
