#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import "SUCodeSigningVerifier.h"
#import "SULog.h"
#include <stdlib.h>
// The upstream verifier logs diagnostics. This fixture only checks the policy.
void SULog(SULogLevel level, NSString *format, ...) {}
@interface PolicyConnection : NSXPCConnection
@property NSString *capturedRequirement;
@end
@implementation PolicyConnection
- (void)setCodeSigningRequirement:(NSString *)value { self.capturedRequirement = value; }
@end
static void check(BOOL value, const char *message) { if (!value) { fprintf(stderr,"%s\n",message); exit(1); } }
int main(int argc, const char *argv[]) {
 @autoreleasepool {
  PolicyConnection *connection = [PolicyConnection new]; NSError *error = nil;
  SUValidateConnectionStatus status = [SUCodeSigningVerifier validateConnection:connection error:&error];
  check(status == SUValidateConnectionStatusSetCodeSigningRequirementSuccess,"A signed updater must install an authenticated peer requirement");
  check([connection.capturedRequirement containsString:@"certificate leaf = H"],"Peer policy must pin the certificate");
  SecRequirementRef requirement = NULL;
  check(SecRequirementCreateWithString((__bridge CFStringRef)connection.capturedRequirement,kSecCSDefaultFlags,&requirement) == errSecSuccess,"Peer policy must compile");
  SecCodeRef selfCode = NULL; SecCodeCopySelf(kSecCSDefaultFlags,&selfCode);
  check(SecCodeCheckValidity(selfCode,kSecCSDefaultFlags,requirement) == errSecSuccess,"The same signer and app identifier must pass");
  SecStaticCodeRef unrelated = NULL;
  SecStaticCodeCreateWithPath((__bridge CFURLRef)[NSURL fileURLWithPath:@"/usr/bin/true"],kSecCSDefaultFlags,&unrelated);
  check(SecStaticCodeCheckValidity(unrelated,kSecCSDefaultFlags,requirement) != errSecSuccess,"An unrelated signer must be rejected");
  CFRelease(unrelated); CFRelease(selfCode); CFRelease(requirement);
  puts("Sparkle certificate peer authentication checks passed");
 }
}
