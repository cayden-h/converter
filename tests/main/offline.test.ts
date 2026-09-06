import { describe, expect, test } from "vitest";
import { enforceOffline, isAllowedRequest } from "../../src/main/offline";

describe("isAllowedRequest", () => {
  test("allows file URLs", () => {
    expect(isAllowedRequest("file:///Applications/Converter.app/index.html")).toBe(true);
  });

  test("allows devtools URLs", () => {
    expect(isAllowedRequest("devtools://devtools/bundled/inspector.html")).toBe(true);
  });

  test("blocks https", () => {
    expect(isAllowedRequest("https://example.com/x.js")).toBe(false);
  });

  test("blocks http", () => {
    expect(isAllowedRequest("http://localhost:9999/telemetry")).toBe(false);
  });

  test("blocks websockets", () => {
    expect(isAllowedRequest("wss://example.com/socket")).toBe(false);
  });

  test("blocks a malformed url rather than defaulting open", () => {
    expect(isAllowedRequest("not a url")).toBe(false);
  });
});

describe("enforceOffline", () => {
  function fakeSession() {
    let registered: ((d: { url: string }, cb: (r: { cancel: boolean }) => void) => void) | null =
      null;
    return {
      session: {
        webRequest: {
          onBeforeRequest(handler: typeof registered) {
            registered = handler;
          },
        },
      },
      decide(url: string): boolean {
        let cancelled = false;
        registered?.({ url }, (r) => {
          cancelled = r.cancel;
        });
        return cancelled;
      },
    };
  }

  test("cancels network requests and permits local ones", () => {
    // Guards the wiring, not just the predicate. Inverting the `!` would keep
    // every isAllowedRequest test green while blocking the app's own files and
    // allowing the network - the exact opposite of the guarantee.
    const fake = fakeSession();
    enforceOffline(fake.session as never);
    expect(fake.decide("https://example.com/x.js"), "https must be cancelled").toBe(true);
    expect(fake.decide("http://localhost:9999/t"), "http must be cancelled").toBe(true);
    expect(fake.decide("file:///app/index.html"), "file must be permitted").toBe(false);
  });
});
