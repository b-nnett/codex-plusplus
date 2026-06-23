export type InjectedSettingsGroupKind = "native-nav-header" | "nav-group" | "pages-group";
export interface InjectedSettingsGroupCandidate<T extends object> {
    group: T;
    kind: InjectedSettingsGroupKind;
    parent: T | null;
    validPlacement: boolean;
    current: boolean;
}
export declare function selectInjectedSettingsGroupsToRemove<T extends object>(candidates: readonly InjectedSettingsGroupCandidate<T>[]): T[];
