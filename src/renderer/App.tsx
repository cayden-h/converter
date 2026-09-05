import { useCallback, useEffect, useState } from "react";
import type { ConvertResult, ToolStatus } from "../shared/ipc";
import { DropZone } from "./components/DropZone";
import { FileRow } from "./components/FileRow";
import { useFiles } from "./useFiles";

export function App() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const { files, add, remove, clear } = useFiles();
  const [outputs, setOutputs] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [results, setResults] = useState<ConvertResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.converter.detectTools().then(setTools);
  }, []);

  // The formats offered are the INTERSECTION of what every selected file can
  // reach. A proper grouped/searchable picker with per-format availability
  // reasons lands in the next task; for now this keeps multi-file selection
  // correct with a plain <select>.
  useEffect(() => {
    if (files.length === 0) {
      setOutputs([]);
      setTarget("");
      return;
    }
    let cancelled = false;
    Promise.all(files.map((file) => window.converter.outputsFor(file.extension))).then(
      (lists) => {
        if (cancelled) return;
        const [first, ...rest] = lists;
        const intersection = (first ?? []).filter((format) =>
          rest.every((list) => list.includes(format)),
        );
        setOutputs(intersection);
        setTarget((prev) => (intersection.includes(prev) ? prev : (intersection[0] ?? "")));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [files]);

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
    setResults(await window.converter.run(files.map((file) => ({ path: file.path, output: target }))));
    setBusy(false);
  };

  return (
    <main className="flex h-full flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-ink">Converter</h1>

      <DropZone hasFiles={files.length > 0} onFiles={add} onBrowse={openFiles} />

      {files.length > 0 && (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {files.map((file) => (
            <FileRow
              key={file.id}
              name={file.name}
              extension={file.extension}
              onRemove={() => remove(file.id)}
            />
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <section className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            Convert to
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-ink"
            >
              {outputs.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={onConvert}
            disabled={busy || !target}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Converting..." : "Convert"}
          </button>
          <button type="button" onClick={clear} className="text-sm text-muted hover:text-ink">
            Clear
          </button>
        </section>
      )}

      {results.map((result) => (
        <p key={result.path} className="text-sm text-ink">
          {result.ok ? (
            <>
              Done: {result.outputPath}{" "}
              <button
                type="button"
                onClick={() => window.converter.reveal(result.outputPath!)}
                className="text-accent underline"
              >
                Reveal
              </button>
            </>
          ) : (
            <>Failed: {result.error}</>
          )}
        </p>
      ))}

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
