#include <ApplicationServices/ApplicationServices.h>
#include <AppKit/AppKit.h>
#include <Foundation/Foundation.h>
#include <node_api.h>
#include <unistd.h>

namespace {

void throwError(napi_env env, const char *message) {
  napi_throw_error(env, nullptr, message);
}

napi_value emptyString(napi_env env) {
  napi_value empty;
  napi_create_string_utf8(env, "", NAPI_AUTO_LENGTH, &empty);
  return empty;
}

napi_value readSelectedText(napi_env env, napi_callback_info info) {
  if (!AXIsProcessTrusted()) {
    throwError(env, "macOS Accessibility permission is required to read the current selected text.");
    return nullptr;
  }

  @autoreleasepool {
    NSRunningApplication *frontmostApplication = [[NSWorkspace sharedWorkspace] frontmostApplication];
    if (frontmostApplication == nil) {
      return emptyString(env);
    }

    AXUIElementRef appElement = AXUIElementCreateApplication(frontmostApplication.processIdentifier);
    if (appElement == nullptr) {
      throwError(env, "Unable to inspect the frontmost application accessibility tree.");
      return nullptr;
    }

    CFTypeRef focusedElement = nullptr;
    AXError focusedError = AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute, &focusedElement);
    CFRelease(appElement);
    if (focusedError != kAXErrorSuccess || focusedElement == nullptr) {
      return emptyString(env);
    }

    CFTypeRef selectedText = nullptr;
    AXError selectedError =
      AXUIElementCopyAttributeValue((AXUIElementRef)focusedElement, kAXSelectedTextAttribute, &selectedText);
    CFRelease(focusedElement);
    if (selectedError != kAXErrorSuccess || selectedText == nullptr || CFGetTypeID(selectedText) != CFStringGetTypeID()) {
      if (selectedText != nullptr) CFRelease(selectedText);
      return emptyString(env);
    }

    NSString *selected = (__bridge NSString *)selectedText;
    napi_value result;
    napi_create_string_utf8(env, selected.UTF8String, NAPI_AUTO_LENGTH, &result);
    CFRelease(selectedText);
    return result;
  }
}

napi_value copySelection(napi_env env, napi_callback_info info) {
  CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
  if (source == nullptr) {
    throwError(env, "Unable to create macOS keyboard event source.");
    return nullptr;
  }

  CGEventRef commandDown = CGEventCreateKeyboardEvent(source, 55, true);
  CGEventRef cDown = CGEventCreateKeyboardEvent(source, 8, true);
  CGEventRef cUp = CGEventCreateKeyboardEvent(source, 8, false);
  CGEventRef commandUp = CGEventCreateKeyboardEvent(source, 55, false);

  if (commandDown == nullptr || cDown == nullptr || cUp == nullptr || commandUp == nullptr) {
    if (commandDown != nullptr) CFRelease(commandDown);
    if (cDown != nullptr) CFRelease(cDown);
    if (cUp != nullptr) CFRelease(cUp);
    if (commandUp != nullptr) CFRelease(commandUp);
    CFRelease(source);
    throwError(env, "Unable to create macOS keyboard events.");
    return nullptr;
  }

  CGEventSetFlags(commandDown, kCGEventFlagMaskCommand);
  CGEventSetFlags(cDown, kCGEventFlagMaskCommand);
  CGEventSetFlags(cUp, kCGEventFlagMaskCommand);

  CGEventPost(kCGHIDEventTap, commandDown);
  usleep(20 * 1000);
  CGEventPost(kCGHIDEventTap, cDown);
  usleep(20 * 1000);
  CGEventPost(kCGHIDEventTap, cUp);
  usleep(20 * 1000);
  CGEventPost(kCGHIDEventTap, commandUp);

  CFRelease(commandDown);
  CFRelease(cDown);
  CFRelease(cUp);
  CFRelease(commandUp);
  CFRelease(source);

  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value init(napi_env env, napi_value exports) {
  napi_value readSelectedTextFunction;
  napi_create_function(env, "readSelectedText", NAPI_AUTO_LENGTH, readSelectedText, nullptr, &readSelectedTextFunction);
  napi_set_named_property(env, exports, "readSelectedText", readSelectedTextFunction);

  napi_value copySelectionFunction;
  napi_create_function(env, "copySelection", NAPI_AUTO_LENGTH, copySelection, nullptr, &copySelectionFunction);
  napi_set_named_property(env, exports, "copySelection", copySelectionFunction);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
