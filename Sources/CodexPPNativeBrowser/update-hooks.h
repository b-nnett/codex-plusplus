// Sparkle owns download verification and installation. Only relaunch is handed
// to the existing helper, which validates and patches the replacement bundle.
#import <objc/message.h>
static NSString *updateSupport;
static NSString *updateHelper;
static IMP originalWillInstall;
static IMP originalInstallOnQuit;
static __weak id pendingUpdateDelegate;
static id terminationObserver;
static IMP originalShouldRelaunch;
static IMP originalShouldProceed;

static NSString *updateVersion(id item) {
  return [item respondsToSelector:@selector(versionString)] ?
    ((id (*)(id, SEL))objc_msgSend)(item, @selector(versionString)) : nil;
}
static BOOL validUpdateBuild(NSString *build) {
  if (![build isKindOfClass:NSString.class] || build.length == 0 || build.length > 12) return NO;
  return [build rangeOfCharacterFromSet:NSCharacterSet.decimalDigitCharacterSet.invertedSet].location == NSNotFound &&
    [build canBeConvertedToEncoding:NSASCIIStringEncoding];
}
static BOOL writeUpdateHandoff(id item, NSString *mode = @"foreground") {
  NSString *build = updateVersion(item);
  if (!NSThread.isMainThread || !validUpdateBuild(build)) return NO;
  NSString *directory = [updateSupport stringByAppendingPathComponent:@"Patching"];
  NSError *error = nil;
  if (![NSFileManager.defaultManager createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:&error]) return NO;
  NSDictionary *ticket = @{@"schema":@1, @"appPath":NSBundle.mainBundle.bundlePath,
    @"helperPath":updateHelper, @"oldPID":@(NSProcessInfo.processInfo.processIdentifier),
    @"targetBuild":build, @"createdAt":@([NSDate.date timeIntervalSince1970]), @"installMode":mode};
  NSData *data = [NSJSONSerialization dataWithJSONObject:ticket options:0 error:&error];
  NSString *file = [directory stringByAppendingPathComponent:@"update-handoff.json"];
  if (!data || ![data writeToFile:file options:NSDataWritingAtomic error:&error]) return NO;
  if (![NSFileManager.defaultManager setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:file error:&error]) return NO;
  return YES;
}
static BOOL shouldProceed(id self, SEL cmd, id updater, id item, NSInteger check, NSError **error) {
  if (!validUpdateBuild(updateVersion(item))) {
    if (error) *error = [NSError errorWithDomain:@"dev.codexpp.update" code:1 userInfo:@{NSLocalizedDescriptionKey:@"The update build identifier is unsupported; Codex++ cannot safely hand off its restart."}];
    return NO;
  }
  return originalShouldProceed ? ((BOOL (*)(id,SEL,id,id,NSInteger,NSError **))originalShouldProceed)(self,cmd,updater,item,check,error) : YES;
}
static void willInstall(id self, SEL cmd, id updater, id item) {
  writeUpdateHandoff(item, pendingUpdateDelegate == self ? @"on-quit" : @"foreground");
  if (originalWillInstall) ((void (*)(id,SEL,id,id))originalWillInstall)(self,cmd,updater,item);
}
static BOOL willInstallOnQuit(id self, SEL cmd, id updater, id item, id block) {
  // A silent install on process exit need not reach the foreground callback.
  // Record the prepared vendor update without taking ownership of its block.
  pendingUpdateDelegate = self;
  writeUpdateHandoff(item, @"on-quit");
  return originalInstallOnQuit ? ((BOOL (*)(id,SEL,id,id,id))originalInstallOnQuit)(self,cmd,updater,item,block) : NO;
}
static BOOL shouldRelaunch(id self, SEL cmd, id updater) {
  // Sparkle uses this as permission to install, so NO would abort the update.
  return originalShouldRelaunch ? ((BOOL (*)(id,SEL,id))originalShouldRelaunch)(self,cmd,updater) : YES;
}
static BOOL configureUpdateHooks(NSString *helper, NSString *support, NSArray *builds) {
  Class cls = NSClassFromString(@"CodexSparkleDelegate");
  if (!NSThread.isMainThread || !cls || !helper.isAbsolutePath || !support.isAbsolutePath || ![builds isKindOfClass:NSArray.class] || builds.count == 0) {
    return NO;
  }
  if (!updateSupport) {
    updateHelper = helper; updateSupport = support;
    auto replace = [&](SEL selector, IMP implementation, const char *types) -> IMP {
      Method method = class_getInstanceMethod(cls,selector);
      if (!method) { class_addMethod(cls,selector,implementation,types); return nullptr; }
      return method_setImplementation(method,implementation);
    };
    originalWillInstall = replace(@selector(updater:willInstallUpdate:),(IMP)willInstall,"v@:@@");
    originalInstallOnQuit = replace(@selector(updater:willInstallUpdateOnQuit:immediateInstallationBlock:),(IMP)willInstallOnQuit,"B@:@@@?");
    originalShouldRelaunch = replace(@selector(updaterShouldRelaunchApplication:),(IMP)shouldRelaunch,"B@:@");
    originalShouldProceed = replace(@selector(updater:shouldProceedWithUpdate:updateCheck:error:),(IMP)shouldProceed,"B@:@@q^@");
    terminationObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSApplicationWillTerminateNotification object:nil queue:nil usingBlock:^(NSNotification *notification) {
      id delegate = pendingUpdateDelegate;
      SEL getter = @selector(installOnQuitUpdateItem);
      if ([delegate respondsToSelector:getter]) {
        id item = ((id (*)(id,SEL))objc_msgSend)(delegate,getter);
        if (item) writeUpdateHandoff(item,@"on-quit");
      }
    }];
  }
  return YES;
}
#ifndef CODEXPP_UPDATE_NATIVE_TEST
static napi_value configureUpdates(napi_env env, napi_callback_info info) {
  size_t argc = 3; napi_value args[3], result;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  auto string = [&](napi_value value) -> NSString * {
    size_t length = 0;
    if (napi_get_value_string_utf8(env,value,nullptr,0,&length) != napi_ok || length > 8192) return nil;
    std::string bytes(length + 1, '\0');
    napi_get_value_string_utf8(env,value,bytes.data(),bytes.size(),&length);
    return [[NSString alloc] initWithBytes:bytes.data() length:length encoding:NSUTF8StringEncoding];
  };
  NSString *helper = argc == 3 ? string(args[0]) : nil;
  NSString *support = argc == 3 ? string(args[1]) : nil;
  NSString *buildJSON = argc == 3 ? string(args[2]) : nil;
  NSArray *builds = buildJSON ? [NSJSONSerialization JSONObjectWithData:[buildJSON dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
  napi_get_boolean(env,configureUpdateHooks(helper,support,builds),&result);
  return result;
}
#endif
