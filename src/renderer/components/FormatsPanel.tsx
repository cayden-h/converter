import { useState } from "react";
import type { ToolStatus } from "../../shared/ipc";

/**
 * Names the main process reports for tools no converter is wired to yet
 * (see `main/formatsPanel.ts`). Duplicated here only for a display label -
 * the main process remains the single source of truth for which tools these
 * are and whether they are actually present.
 */
const UNWIRED_NAMES = new Set(["libreoffice", "calibre", "inkscape", "vtracer"]);

interface FormatsPanelProps {
  tools: ToolStatus[];
}

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title="Copy install command"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be denied; the command is still visible
          // and selectable by hand, so failing silently is fine here.
        }
      }}
      className="truncate rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink hover:bg-border"
    >
      {copied ? "Copied!" : command}
    </button>
  );
}

export function FormatsPanel({ tools }: FormatsPanelProps) {
  return (
    <details className="mt-auto rounded-lg border border-border bg-elevated text-muted">
      <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-sm font-medium text-ink">
        Formats &amp; tools
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
        <p className="text-xs leading-relaxed text-muted">
          Writing .docx, .xlsx and .pptx, and reading .xlsx and .pptx, need LibreOffice, a
          ~800MB app that is not bundled with this converter. Reading .docx already works
          without it, through pandoc. Install LibreOffice below to unlock the rest of Office
          support.
        </p>
        <ul className="flex flex-col gap-1.5">
          {tools.map((tool) => (
            <li
              key={tool.name}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={tool.available ? "text-accent" : "text-muted"}
                >
                  {tool.available ? "●" : "○"}
                </span>
                <span className="text-sm text-ink">{tool.name}</span>
                {UNWIRED_NAMES.has(tool.name) && (
                  <span className="rounded bg-surface px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    detected only
                  </span>
                )}
              </div>
              {tool.available ? (
                <span
                  className="max-w-[60%] truncate font-mono text-xs text-muted"
                  title={tool.path}
                >
                  {tool.path}
                </span>
              ) : tool.installHint ? (
                <CopyableCommand command={tool.installHint} />
              ) : (
                <span className="text-xs text-muted">not installed</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
