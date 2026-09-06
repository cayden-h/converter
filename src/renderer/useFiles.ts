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

/**
 * Merges newly dropped/picked paths into the existing queue, deduplicating by
 * path. Pure so it can be unit tested without a React renderer.
 */
export function addPaths(existing: QueuedFile[], incoming: string[]): QueuedFile[] {
  const seen = new Set(existing.map((file) => file.path));
  const additions: QueuedFile[] = [];
  for (const path of incoming) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    additions.push(toQueuedFile(path));
  }
  return additions.length > 0 ? [...existing, ...additions] : existing;
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
    setFiles((prev) => addPaths(prev, paths));
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  return { files, add, remove, clear };
}
