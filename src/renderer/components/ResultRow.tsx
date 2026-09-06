import { friendlyError } from "../../shared/friendlyError";

export type RowStatus = "queued" | "converting" | "done" | "failed";

interface ResultRowProps {
  name: string;
  extension: string;
  status: RowStatus;
  error?: string;
  /** Requested output format, so the message can name it. */
  target?: string;
  outputPath?: string;
  onReveal(): void;
  onOpen(): void;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  queued: "Queued",
  converting: "Converting...",
  done: "Done",
  failed: "Failed",
};

const STATUS_CLASS: Record<RowStatus, string> = {
  queued: "text-muted",
  converting: "text-accent",
  done: "text-accent",
  failed: "text-ink",
};

export function ResultRow({ name, extension, status, error, target, outputPath, onReveal, onOpen }: ResultRowProps) {
  const failure = error ? friendlyError(error, { from: extension, to: target ?? "" }) : null;
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-elevated px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-xs uppercase text-muted">
            {extension || "?"}
          </span>
          <span className="truncate text-sm text-ink">{name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
          {status === "done" && (
            <>
              <button
                type="button"
                onClick={onReveal}
                className="rounded px-2 py-1 text-xs text-accent hover:underline"
              >
                Reveal in Finder
              </button>
              <button
                type="button"
                onClick={onOpen}
                className="rounded px-2 py-1 text-xs text-accent hover:underline"
              >
                Open
              </button>
            </>
          )}
        </div>
      </div>
      {status === "failed" && failure && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-ink">{failure.message}</p>
          {/*
            The raw tool output is kept rather than discarded: it is the only
            thing that helps when the friendly message does not fit the case.
            It is collapsed so it does not shout at someone who just wants to
            know their file did not convert.
          */}
          {failure.detail !== failure.message && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer select-none hover:text-ink">
                Technical details
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-surface px-2 py-1 text-[11px] leading-snug">
                {failure.detail}
              </pre>
            </details>
          )}
        </div>
      )}
      {status === "done" && outputPath && (
        <p className="truncate text-xs text-muted">{outputPath}</p>
      )}
    </li>
  );
}
