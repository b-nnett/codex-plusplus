#include <Security/Security.h>
#include <dlfcn.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>

// The vendor launcher retains its allocator setup, argv and exit behavior.
// Set the process policy before loading Electron, including its initializers.
__attribute__((visibility("default"))) int ChromeMain(int argc, char **argv) {
    if (SecKeychainSetUserInteractionAllowed(false) != errSecSuccess) {
        fprintf(stderr, "[Codex++] Cannot establish noninteractive Keychain policy.\n");
        return 78;
    }
    Dl_info own;
    char path[PATH_MAX];
    if (!dladdr((void *)&ChromeMain, &own) || !own.dli_fname || strlen(own.dli_fname) >= sizeof(path)) return 78;
    strcpy(path, own.dli_fname);
    char *slash = strrchr(path, '/');
    if (!slash) return 78;
    *slash = '\0';
    const char *suffix = "/Codex Framework.framework/Versions/Current/Codex Framework";
    if (strlen(path) + strlen(suffix) >= sizeof(path)) return 78;
    strcat(path, suffix);
    // Match the vendor launcher's global symbol scope: Node addons resolve
    // their Node-API entry points from this framework.
    void *framework = dlopen(path, RTLD_LAZY | RTLD_GLOBAL);
    int (*mainFunction)(int, char **) = framework ? dlsym(framework, "ChromeMain") : NULL;
    if (!mainFunction) {
        fprintf(stderr, "[Codex++] Cannot load the verified Electron entry point: %s\n", dlerror());
        return 78;
    }
    return mainFunction(argc, argv);
}
