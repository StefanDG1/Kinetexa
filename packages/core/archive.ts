import { ZipReader, Uint8ArrayReader } from "@zip.js/zip.js";

export async function readArchiveFiles(
  bytes: Uint8Array,
  limits: { entries: number; expandedBytes: number; fileBytes: number },
) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), {
    useWebWorkers: false,
    strictness: "strict",
    checkCrc32: true,
    checkOverlappingEntry: true,
  });
  const files = new Map<string, Uint8Array>();
  const names = new Set<string>();
  let total = 0;
  try {
    for await (const entry of reader.getEntriesGenerator()) {
      const name = entry.filename;
      if (names.size >= limits.entries)
        throw new Error("Archive has too many entries.");
      if (names.has(name)) throw new Error("Archive contains duplicate paths.");
      names.add(name);
      if (
        /[\u0000-\u001f\\]/.test(name) ||
        name.startsWith("/") ||
        /^[A-Za-z]:/.test(name) ||
        name.split("/").includes("..")
      )
        throw new Error("Archive contains an unsafe path.");
      if (/\.(zip|7z|rar|tar)$/i.test(name))
        throw new Error("Nested archives are not supported.");
      if (entry.encrypted)
        throw new Error("Encrypted archives are not supported.");
      total += entry.uncompressedSize;
      if (
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize < 0 ||
        total > limits.expandedBytes ||
        entry.uncompressedSize > limits.fileBytes ||
        entry.uncompressedSize >
          Math.max(1024 * 1024, entry.compressedSize * 200)
      )
        throw new Error("Archive expansion limit exceeded.");
      if (
        entry.directory ||
        !(
          /\.(fit|tcx|gpx)(\.gz)?$/i.test(name) ||
          /(^|\/)activities\.csv$/i.test(name)
        )
      )
        continue;
      // The writer bounds actual output, even if a forged header understates it.
      const data = new Uint8Array(entry.uncompressedSize);
      let written = 0;
      await entry.getData(
        new WritableStream<Uint8Array>({
          write(chunk) {
            if (written + chunk.length > data.length)
              throw new Error("Archive expansion limit exceeded.");
            data.set(chunk, written);
            written += chunk.length;
          },
        }),
      );
      if (written !== data.length)
        throw new Error("Archive entry size does not match its contents.");
      files.set(name, data);
    }
    return { files, total };
  } finally {
    await reader.close();
  }
}
