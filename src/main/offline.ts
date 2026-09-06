import type { Session } from "electron";

const ALLOWED_PROTOCOLS = new Set(["file:", "devtools:", "blob:", "data:"]);

/**
 * The app must never reach the network. We allowlist local schemes and block
 * everything else, so the guarantee holds even for code we did not write.
 */
export function isAllowedRequest(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function enforceOffline(session: Session): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRequest(details.url) });
  });
}
