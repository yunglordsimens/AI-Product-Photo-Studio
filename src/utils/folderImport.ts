/**
 * Folder import: a dropped or picked folder becomes cards on the canvas, one group per
 * subfolder ("3_Odpoledni / Poke Bowls"), laid out as blocks so the structure stays visible.
 */
import { isImageFile } from './heic';

export interface FolderFile {
  file: File;
  /** Path inside the picked folder, e.g. "Oryza_menu_photos/3_Odpoledni/Poke Bowls/Salmon Bowl.jpeg" */
  path: string;
}

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (es: FsEntry[]) => void, err: (e: unknown) => void) => void };
};

async function walk(entry: FsEntry, out: FolderFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, err) => entry.file!(ok, err));
    if (isImageFile(file) && !file.name.startsWith('.')) out.push({ file, path: entry.fullPath.replace(/^\//, '') });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns results in batches until it returns an empty list
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok, err) => reader.readEntries(ok, err));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/**
 * Reads a drop. Returns null when nothing dropped is a folder (plain files keep the normal flow).
 * Entries must be taken synchronously inside the drop handler, so call this before any await.
 */
export function folderEntriesFromDrop(dt: DataTransfer): FsEntry[] | null {
  const items = Array.from(dt.items || []);
  const entries: FsEntry[] = [];
  for (const it of items) {
    const entry = (it as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.();
    if (entry) entries.push(entry as FsEntry);
  }
  return entries.some((e) => e.isDirectory) ? entries : null;
}

export async function collectFolderFiles(entries: FsEntry[]): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  for (const e of entries) await walk(e, out);
  return out;
}

/** Files from <input webkitdirectory> carry their path in webkitRelativePath. */
export function folderFilesFromInput(files: File[]): FolderFile[] {
  return files
    .filter((f) => isImageFile(f) && !f.name.startsWith('.'))
    .map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }));
}

/**
 * Splits files by folder. Folders shared by every file ("smartsat / foto") are dropped from the names,
 * so each group is named by what makes it different.
 */
export function groupByFolder(files: FolderFile[]): { name: string; files: FolderFile[] }[] {
  const dirs = files.map((f) => f.path.split('/').slice(0, -1));
  let common = 0;
  if (dirs.length) {
    const minLen = Math.min(...dirs.map((d) => d.length));
    while (common < minLen && dirs.every((d) => d[common] === dirs[0][common])) common++;
  }
  const map = new Map<string, FolderFile[]>();
  files.forEach((f, i) => {
    const parts = dirs[i].slice(common);
    const key = parts.join(' / ') || dirs[i][dirs[i].length - 1] || 'Папка';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...map.entries()]
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(([name, fs]) => ({ name, files: fs.sort((a, b) => collator.compare(a.path, b.path)) }));
}

/**
 * Copies picked files into memory. A file from a folder picker can become unreadable once the input is
 * cleared, and the «куда загрузить?» question reads them later.
 */
export async function snapshotFolderFiles(files: FolderFile[]): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  for (const f of files) {
    try {
      const buf = await f.file.arrayBuffer();
      out.push({ path: f.path, file: new File([buf], f.file.name, { type: f.file.type, lastModified: f.file.lastModified }) });
    } catch {
      // unreadable: skip
    }
  }
  return out;
}
