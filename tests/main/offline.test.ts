import { describe, expect, test } from "vitest";
import { isAllowedRequest } from "../../src/main/offline";

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
