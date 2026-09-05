import { useCallback, useState } from "react";

export interface QueuedFile {
  /** Stable identity for React keys and removal; the absolute path is unique per file. */
  id: string;
  path: string;
  name: string;
  extension: string;
}

function toQueuedFile(path: string): QueuedFile {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1) : "";
  return { id: path, path, name, extension };
}

export interface UseFilesResult {
  files: QueuedFile[];
  /** Adds absolute paths, deduplicating against files already in the list. */
  add(paths: string[]): void;
  remove(id: string): void;
  clear(): void;
}

export function useFiles(): UseFilesResult {
  const [files, setFiles] = useState<QueuedFile[]>([]);

  const add = useCallback((paths: string[]) => {
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.path));
      const additions = paths.filter((path) => path && !existing.has(path)).map(toQueuedFile);
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  return { files, add, remove, clear };
}
