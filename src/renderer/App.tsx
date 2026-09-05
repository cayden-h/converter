import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormatGroup, ProgressUpdate, ToolStatus } from "../shared/ipc";
import { DropZone } from "./components/DropZone";
import { FileRow } from "./components/FileRow";
import { FormatPicker } from "./components/FormatPicker";
import { ResultRow, type RowStatus } from "./components/ResultRow";
import { computeFormatAvailability } from "./formatAvailability";
import { useFiles } from "./useFiles";

interface RowState {
  status: RowStatus;
  error?: string;
  outputPath?: string;
}

export function App() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const { files, add, remove, clear } = useFiles();
  const [perFileGroups, setPerFileGroups] = useState<FormatGroup[][]>([]);
  const [target, setTarget] = useState("");
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [busy, setBusy] = useState(false);

  // Subscribe once for the component's lifetime. Re-subscribing on every
  // render (or every batch) would stack listeners, so each progress event
  // would update rows multiple times.
  useEffect(() => {
    const unsubscribe = window.converter.onProgress((update: ProgressUpdate) => {
      if (update.status === "running") {
        setRows((prev) => new Map(prev).set(update.path, { status: "converting" }));
      } else if (update.status === "failed") {
        setRows((prev) =>
          new Map(prev).set(update.path, { status: "failed", error: update.error }),
        );
      }
      // "done" is left for the final result merge in onConvert, which also
      // carries the outputPath the engine's progress event does not include.
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    window.converter.detectTools().then(setTools);
  }, []);

  useEffect(() => {
    if (files.length === 0) {
      setPerFileGroups([]);
      return;
    }
    let cancelled = false;
    Promise.all(files.map((file) => window.converter.groupedOutputsFor(file.extension))).then(
      (groups) => {
        if (!cancelled) setPerFileGroups(groups);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [files]);

  const availability = useMemo(
    () => computeFormatAvailability(perFileGroups),
    [perFileGroups],
  );

  // If the currently selected target stops being reachable by every file
  // (the file list changed), fall back to the first still-enabled format.
  useEffect(() => {
    const current = availability.find((item) => item.format === target);
    if (current?.enabled) return;
    setTarget(availability.find((item) => item.enabled)?.format ?? "");
  }, [availability, target]);

  const openFiles = useCallback(async () => {
    const paths = await window.converter.openFiles();
    if (paths.length > 0) add(paths);
  }, [add]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openFiles();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFiles]);

  const onConvert = async () => {
    if (files.length === 0 || !target) return;
    setBusy(true);
    setRows(new Map(files.map((file) => [file.id, { status: "queued" as RowStatus }])));
    const results = await window.converter.run(
      files.map((file) => ({ path: file.path, output: target })),
    );
    // The final results are authoritative: they carry the outputPath a "done"
    // progress event doesn't, and they are the only signal at all for files
    // that never ran (e.g. cancelled while still queued) - keying by full
    // input path, never basename, so same-named files from different
    // directories cannot collide.
    setRows((prev) => {
      const next = new Map(prev);
      for (const result of results) {
        next.set(result.path, result.ok
          ? { status: "done", outputPath: result.outputPath }
          : { status: "failed", error: result.error });
      }
      return next;
    });
    setBusy(false);
  };

  const onCancel = () => {
    window.converter.cancel();
  };

  return (
    <main className="flex h-full flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-ink">Converter</h1>

      <DropZone hasFiles={files.length > 0} onFiles={add} onBrowse={openFiles} />

      {files.length > 0 && (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {files.map((file) => {
            const row = rows.get(file.id);
            return row ? (
              <ResultRow
                key={file.id}
                name={file.name}
                extension={file.extension}
                status={row.status}
                error={row.error}
                outputPath={row.outputPath}
                onReveal={() => window.converter.reveal(row.outputPath!)}
                onOpen={() => window.converter.openPath(row.outputPath!)}
              />
            ) : (
              <FileRow
                key={file.id}
                name={file.name}
                extension={file.extension}
                onRemove={() => remove(file.id)}
              />
            );
          })}
        </ul>
      )}

      {files.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ink">Convert to</h2>
          <FormatPicker perFileGroups={perFileGroups} value={target} onChange={setTarget} />
          <div className="flex items-center gap-3">
            <button
              onClick={busy ? onCancel : onConvert}
              disabled={!busy && !target}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Cancel" : "Convert"}
            </button>
            <button
              type="button"
              onClick={() => {
                clear();
                setRows(new Map());
              }}
              disabled={busy}
              className="text-sm text-muted hover:text-ink disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </section>
      )}

      <details className="mt-auto text-sm text-muted">
        <summary>Formats</summary>
        <ul>
          {tools.map((tool) => (
            <li key={tool.name}>
              {tool.name}: {tool.available ? tool.path : "not installed"}
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
