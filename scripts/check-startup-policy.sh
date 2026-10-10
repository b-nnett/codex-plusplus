#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d "${TMPDIR:-/tmp}/codexpp-startup-policy.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/Codex Framework.framework/Versions/Current"
cat > "$work/framework.c" <<'C'
#include <Security/Security.h>
#include <string.h>
static int initializedWithoutInteraction;
int fixtureNativeAPI(void) { return 7; }
__attribute__((constructor)) static void initialize(void) {
    Boolean allowed = true;
    initializedWithoutInteraction = SecKeychainGetUserInteractionAllowed(&allowed) == 0 && !allowed;
}
int ChromeMain(int argc, char **argv) {
    Boolean allowed = true;
    if (!initializedWithoutInteraction || SecKeychainGetUserInteractionAllowed(&allowed) || allowed) return 1;
    return argc == 2 && !strcmp(argv[1], "preserved-argument") ? 42 : 2;
}
C
cat > "$work/harness.c" <<'C'
#include <dlfcn.h>
int main(int argc, char **argv) {
    void *library = dlopen(argv[1], RTLD_LAZY | RTLD_LOCAL | RTLD_FIRST);
    int (*entry)(int, char **) = library ? dlsym(library, "ChromeMain") : 0;
    char *arguments[] = {"fixture", "preserved-argument", 0};
    return entry && entry(2, arguments) == 42 && dlsym(RTLD_DEFAULT, "fixtureNativeAPI") ? 0 : 1;
}
C
clang -dynamiclib -framework Security Sources/CodexPPNativeBrowser/startup-policy.c -o "$work/CodexPPStartup.dylib"
clang -dynamiclib -framework Security "$work/framework.c" -o "$work/Codex Framework.framework/Versions/Current/Codex Framework"
clang "$work/harness.c" -o "$work/harness"
"$work/harness" "$work/CodexPPStartup.dylib"
echo 'Startup policy precedes framework initialization and preserves arguments and return value.'
