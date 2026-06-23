"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectInjectedSettingsGroupsToRemove = selectInjectedSettingsGroupsToRemove;
function selectInjectedSettingsGroupsToRemove(candidates) {
    const remove = new Set();
    const groupsByParentAndKind = new Map();
    for (const candidate of candidates) {
        if (!candidate.validPlacement || !candidate.parent) {
            remove.add(candidate.group);
            continue;
        }
        let groupsByKind = groupsByParentAndKind.get(candidate.parent);
        if (!groupsByKind) {
            groupsByKind = new Map();
            groupsByParentAndKind.set(candidate.parent, groupsByKind);
        }
        const repeatedGroups = groupsByKind.get(candidate.kind) ?? [];
        repeatedGroups.push(candidate);
        groupsByKind.set(candidate.kind, repeatedGroups);
    }
    for (const groupsByKind of groupsByParentAndKind.values()) {
        for (const repeatedGroups of groupsByKind.values()) {
            if (repeatedGroups.length <= 1)
                continue;
            const keep = repeatedGroups.find((candidate) => candidate.current) ?? repeatedGroups[0];
            for (const candidate of repeatedGroups) {
                if (candidate !== keep)
                    remove.add(candidate.group);
            }
        }
    }
    return candidates
        .map((candidate) => candidate.group)
        .filter((group) => remove.has(group));
}
//# sourceMappingURL=settings-sidebar-dedupe.js.map