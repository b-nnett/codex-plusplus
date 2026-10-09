#define CODEXPP_BROWSER_NATIVE_TEST
#import "../Sources/CodexPPNativeBrowser/browser-native.mm"
#include <cstdlib>

@interface BridgedContentView : NSView @end
@implementation BridgedContentView @end
@interface RenderWidgetHostViewCocoa : NSTextView
@property BOOL suppressInputContext;
@end
@implementation RenderWidgetHostViewCocoa
- (NSTextInputContext *)inputContext { return self.suppressInputContext ? nil : super.inputContext; }
@end
static void check(bool condition, const char *message) { if (!condition) { fprintf(stderr, "%s\n", message); std::exit(1); } }
int main() {
 @autoreleasepool {
  [NSApplication sharedApplication];
  NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,100,100) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
  window.releasedWhenClosed = NO;
  BridgedContentView *wrapper = [[BridgedContentView alloc] initWithFrame:NSMakeRect(0,0,100,100)];
  window.contentView = wrapper;
  RenderWidgetHostViewCocoa *input = [[RenderWidgetHostViewCocoa alloc] initWithFrame:NSMakeRect(0,0,100,100)];
  [wrapper addSubview:input]; [window makeFirstResponder:input];
  check(viewForMenu(wrapper, window) == wrapper, "Unarmed menus must retain their view");
  check(prepareMenu(window), "An editable native input must be eligible");
  check(viewForMenu(wrapper, window) == input, "The reviewed wrapper must resolve to the focused input");
  check(viewForMenu(wrapper, window) == wrapper, "An arm must be consumed by one popup");
  check(prepareMenu(window), "Prepare for cancellation"); cancelMenu();
  check(viewForMenu(wrapper, window) == wrapper, "Disable/cleanup must cancel a pending arm");
  check(prepareMenu(window), "Prepare for expiry"); menuDeadline = std::chrono::steady_clock::now() - std::chrono::seconds(1);
  check(viewForMenu(wrapper, window) == wrapper, "Expired arms must retain the original view");
  check(prepareMenu(window), "Prepare for window identity check");
  check(viewForMenu(wrapper, nil) == wrapper, "Other windows must not consume the corrected view");
  check(prepareMenu(window), "Prepare for focus change"); [window makeFirstResponder:nil];
  check(viewForMenu(wrapper, window) == wrapper, "Focus changes must retain the original view");
  [window makeFirstResponder:input]; input.suppressInputContext = YES;
  check(!prepareMenu(window), "Inputs without a native input context must remain unchanged");
  input.suppressInputContext = NO; check(prepareMenu(window), "Prepare for already-correct view");
  check(viewForMenu(input, window) == input, "A correct native view must remain unchanged");
  [window close]; puts("Native browser view checks passed");
 }
}
