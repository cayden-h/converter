interface FileRowProps {
  name: string;
  extension: string;
  onRemove(): void;
}

export function FileRow({ name, extension, onRemove }: FileRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-xs uppercase text-muted">
          {extension || "?"}
        </span>
        <span className="truncate text-sm text-ink">{name}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="shrink-0 rounded px-2 py-1 text-sm text-muted hover:bg-surface hover:text-ink"
      >
        &times;
      </button>
    </li>
  );
}
