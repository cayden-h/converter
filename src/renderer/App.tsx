import { useEffect, useState } from "react";
import type { ConvertResult, ToolStatus } from "../shared/ipc";

interface Dropped {
  path: string;
  name: string;
  extension: string;
}

export function App() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [file, setFile] = useState<Dropped | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [results, setResults] = useState<ConvertResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.converter.detectTools().then(setTools);
  }, []);

  useEffect(() => {
    if (!file) return;
    window.converter.outputsFor(file.extension).then((list) => {
      setOutputs(list);
      setTarget(list[0] ?? "");
    });
  }, [file]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;
    // Electron 32 removed File.path. Reading it here would silently yield
    // undefined and drag-and-drop would never work, so go through the preload's
    // webUtils bridge instead.
    const path = window.converter.pathForFile(dropped);
    const extension = dropped.name.split(".").pop() ?? "";
    setFile({ path, name: dropped.name, extension });
    setResults([]);
  };

  const onConvert = async () => {
    if (!file || !target) return;
    setBusy(true);
    setResults(await window.converter.run([{ path: file.path, output: target }]));
    setBusy(false);
  };

  return (
    <main
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{ fontFamily: "system-ui", padding: 24 }}
    >
      <h1>Converter</h1>

      <section
        style={{ border: "2px dashed #999", borderRadius: 12, padding: 32, textAlign: "center" }}
      >
        {file ? file.name : "Drop a file here"}
      </section>

      {file && (
        <section style={{ marginTop: 16 }}>
          <label>
            Convert to{" "}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {outputs.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <button onClick={onConvert} disabled={busy || !target} style={{ marginLeft: 12 }}>
            {busy ? "Converting..." : "Convert"}
          </button>
        </section>
      )}

      {results.map((result) => (
        <p key={result.path}>
          {result.ok ? (
            <>
              Done: {result.outputPath}{" "}
              <button onClick={() => window.converter.reveal(result.outputPath!)}>Reveal</button>
            </>
          ) : (
            <>Failed: {result.error}</>
          )}
        </p>
      ))}

      <details style={{ marginTop: 32 }}>
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
