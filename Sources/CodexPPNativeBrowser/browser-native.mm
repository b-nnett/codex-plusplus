#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <chrono>
#include <cstring>
#ifndef CODEXPP_BROWSER_NATIVE_TEST
#include <node_api.h>
#endif

// The reviewed framework passes BridgedContentView to AppKit instead of its
// editable RenderWidgetHostViewCocoa. Correct only a menu explicitly armed by
// the trusted main-process browser bridge; all other menus retain their view.
static __weak NSWindow *menuWindow;
static __weak NSView *menuInput;
static std::chrono::steady_clock::time_point menuDeadline;
static IMP originalPopup;

static void cancelMenu() {
  menuWindow = nil;
  menuInput = nil;
  menuDeadline = {};
}

static bool prepareMenu(NSWindow *window) {
  cancelMenu();
  if (!NSThread.isMainThread || !window) return false;
  id responder = window.firstResponder;
  if (![responder isKindOfClass:NSClassFromString(@"RenderWidgetHostViewCocoa")] ||
      ![responder isKindOfClass:NSView.class] ||
      ![responder conformsToProtocol:@protocol(NSTextInputClient)] ||
      ((NSView *)responder).window != window || [responder inputContext] == nil) return false;
  menuWindow = window;
  menuInput = responder;
  menuDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  return true;
}

static NSView *viewForMenu(NSView *view, NSWindow *eventWindow) {
  NSWindow *window = menuWindow;
  NSView *input = menuInput;
  const bool eligible = NSThread.isMainThread && window && input &&
    std::chrono::steady_clock::now() < menuDeadline && eventWindow == window &&
    view.window == window && input.window == window && window.firstResponder == input &&
    [view isKindOfClass:NSClassFromString(@"BridgedContentView")] && input.inputContext != nil;
  cancelMenu(); // One popup only. No state remains while macOS tracks the menu.
  return eligible ? input : view;
}

static void popup(id cls, SEL selector, NSMenu *menu, NSEvent *event, NSView *view) {
  NSView *target = viewForMenu(view, event.window);
  ((void (*)(id, SEL, NSMenu *, NSEvent *, NSView *))originalPopup)(cls, selector, menu, event, target);
}

#ifndef CODEXPP_BROWSER_NATIVE_TEST
static napi_value prepare(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], result;
  bool isBuffer = false;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc != 1 || napi_is_buffer(env, argv[0], &isBuffer) != napi_ok || !isBuffer) {
    napi_throw_type_error(env, nullptr, "A native window handle is required."); return nullptr;
  }
  void *bytes = nullptr;
  size_t size = 0;
  napi_get_buffer_info(env, argv[0], &bytes, &size);
  if (size != sizeof(void *) || !NSThread.isMainThread) {
    napi_throw_type_error(env, nullptr, "Invalid native window handle or thread."); return nullptr;
  }
  void *pointer = nullptr;
  std::memcpy(&pointer, bytes, sizeof(pointer));
  if (!pointer) { napi_throw_type_error(env, nullptr, "Empty native window handle."); return nullptr; }
  @try {
    id root = (__bridge id)pointer;
    NSWindow *window = [root isKindOfClass:NSView.class] ? ((NSView *)root).window :
      ([root isKindOfClass:NSWindow.class] ? (NSWindow *)root : nil);
    napi_get_boolean(env, prepareMenu(window), &result);
    return result;
  } @catch (NSException *exception) {
    cancelMenu();
    napi_throw_error(env, nullptr, "The native browser input view is unavailable."); return nullptr;
  }
}

static napi_value cancel(napi_env env, napi_callback_info info) {
  cancelMenu();
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

static napi_value init(napi_env env, napi_value exports) {
  Method method = class_getClassMethod(NSMenu.class, @selector(popUpContextMenu:withEvent:forView:));
  if (!method) { napi_throw_error(env, nullptr, "The native context-menu API is unavailable."); return nullptr; }
  originalPopup = method_setImplementation(method, (IMP)popup);
  napi_value fn, protocol;
  napi_create_function(env, "prepare", NAPI_AUTO_LENGTH, prepare, nullptr, &fn);
  napi_set_named_property(env, exports, "prepare", fn);
  napi_create_function(env, "cancel", NAPI_AUTO_LENGTH, cancel, nullptr, &fn);
  napi_set_named_property(env, exports, "cancel", fn);
  napi_create_int32(env, 1, &protocol);
  napi_set_named_property(env, exports, "protocol", protocol);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
#endif
