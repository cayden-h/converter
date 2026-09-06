import { useState, type DragEvent } from "react";

interface DropZoneProps {
  /** Once files are queued the zone shrinks to a slim strip instead of filling the window. */
  hasFiles: boolean;
  onFiles(paths: string[]): void;
  onBrowse(): void;
}

export function DropZone({ hasFiles, onFiles, onBrowse }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    // Electron 32 removed File.path. Reading it here would silently yield
    // undefined and drag-and-drop would never work, so go through the
    // preload's webUtils bridge instead.
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.converter.pathForFile(file))
      .filter((path): path is string => Boolean(path));
    if (paths.length > 0) onFiles(paths);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={onBrowse}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onBrowse();
        }
      }}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors",
        dragging ? "border-accent bg-elevated" : "border-border hover:border-accent",
        hasFiles ? "px-4 py-3" : "flex-1",
      ].join(" ")}
    >
      {hasFiles ? (
        <p className="text-sm text-muted">Drop more files, or click to browse (⌘O)</p>
      ) : (
        <>
          <p className="text-lg font-medium text-ink">Drop files here</p>
          <p className="text-sm text-muted">or click to browse, or press ⌘O</p>
        </>
      )}
    </div>
  );
}
