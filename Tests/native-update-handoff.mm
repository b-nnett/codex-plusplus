#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <string>
#include <cstdlib>
#define CODEXPP_UPDATE_NATIVE_TEST
#import "../Sources/CodexPPNativeBrowser/update-hooks.h"
@interface CodexSparkleDelegate : NSObject
@property NSInteger installations;
@property NSInteger automaticInstallations;
@property id installOnQuitUpdateItem;
@end
@implementation CodexSparkleDelegate
- (void)updater:(id)updater willInstallUpdate:(id)item { self.installations++; }
- (BOOL)updater:(id)updater willInstallUpdateOnQuit:(id)item immediateInstallationBlock:(id)block { self.automaticInstallations++; self.installOnQuitUpdateItem = item; return YES; }
@end
@interface UpdateItem : NSObject
@property NSString *versionString;
@end
@implementation UpdateItem @end
static void check(bool value,const char *message) { if (!value) { fprintf(stderr,"%s\n",message); std::exit(1); } }
int main() {
 @autoreleasepool {
  NSString *root = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
  check(configureUpdateHooks(@"/Applications/Codex++.app",root,@[@"20052"]),"Configure native updater delegate");
  auto delegate = [CodexSparkleDelegate new]; auto item = [UpdateItem new];
  NSError *error = nil;
  item.versionString = @"changed";
  check(!shouldProceed(delegate,@selector(updater:shouldProceedWithUpdate:updateCheck:error:),nil,item,0,&error) && error != nil,"Invalid build identifiers must not bypass handoff validation");
  item.versionString = @"20053";
  check(shouldProceed(delegate,@selector(updater:shouldProceedWithUpdate:updateCheck:error:),nil,item,0,nil),"Future vendor builds must reach authenticated adapter discovery");
  item.versionString = @"20052";
  check(shouldProceed(delegate,@selector(updater:shouldProceedWithUpdate:updateCheck:error:),nil,item,0,nil),"Approved builds retain Sparkle installation");
  ((void (*)(id,SEL,id,id))objc_msgSend)(delegate,@selector(updater:willInstallUpdate:),nil,item);
  check(delegate.installations == 1,"Vendor installation callback must be preserved");
  NSString *file = [root stringByAppendingPathComponent:@"Patching/update-handoff.json"];
  NSDictionary *ticket = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:file] options:0 error:nil];
  check([ticket[@"targetBuild"] isEqual:@"20052"] && [ticket[@"helperPath"] isEqual:@"/Applications/Codex++.app"],"Durable handoff identifies the exact replacement and helper");
  NSDictionary *attrs = [NSFileManager.defaultManager attributesOfItemAtPath:file error:nil];
  check([attrs[NSFilePosixPermissions] intValue] == 0600,"Ticket must stay private");
  check(((BOOL (*)(id,SEL,id))objc_msgSend)(delegate,@selector(updaterShouldRelaunchApplication:),nil),"Sparkle installation permission must stay enabled");
  __block bool invoked = false;
  check(((BOOL (*)(id,SEL,id,id,id))objc_msgSend)(delegate,@selector(updater:willInstallUpdateOnQuit:immediateInstallationBlock:),nil,item,^{ invoked = true; }),"Preserve vendor install-on-quit return value");
  check(delegate.automaticInstallations == 1 && !invoked,"Do not invoke or replace the vendor installation block");
  ticket = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:file] options:0 error:nil];
  check([ticket[@"installMode"] isEqual:@"on-quit"],"Background preparations must create a handoff");
  [NSFileManager.defaultManager removeItemAtPath:file error:nil];
  [NSNotificationCenter.defaultCenter postNotificationName:NSApplicationWillTerminateNotification object:nil];
  check([NSFileManager.defaultManager fileExistsAtPath:file],"Refresh the selected prepared update on termination");
  delegate.installOnQuitUpdateItem = nil;
  [NSFileManager.defaultManager removeItemAtPath:file error:nil];
  [NSNotificationCenter.defaultCenter postNotificationName:NSApplicationWillTerminateNotification object:nil];
  check(![NSFileManager.defaultManager fileExistsAtPath:file],"Cleared update selections must not create stale handoffs");
  [NSFileManager.defaultManager removeItemAtPath:root error:nil];
  puts("Native update handoff checks passed");
 }
}
