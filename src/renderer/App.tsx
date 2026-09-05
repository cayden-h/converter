import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConvertResult, FormatGroup, ToolStatus } from "../shared/ipc";
import { DropZone } from "./components/DropZone";
import { FileRow } from "./components/FileRow";
import { FormatPicker } from "./components/FormatPicker";
import { computeFormatAvailability } from "./formatAvailability";
import { useFiles } from "./useFiles";

export function App() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const { files, add, remove, clear } = useFiles();
  const [perFileGroups, setPerFileGroups] = useState<FormatGroup[][]>([]);
  const [target, setTarget] = useState("");
  const [results, setResults] = useState<ConvertResult[]>([]);
  const [busy, setBusy] = useState(false);

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
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ink">Convert to</h2>
          <FormatPicker perFileGroups={perFileGroups} value={target} onChange={setTarget} />
          <div className="flex items-center gap-3">
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
          </div>
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
