import { expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { unpackArchive } from "./import";
import { readArchiveFiles } from "./archive";

it("rejects damaged stored ZIP data even when the activity text remains valid", async () => {
  const archive = zipSync(
    { "ride.gpx": strToU8("<gpx><name>Original</name></gpx>") },
    { level: 0 },
  );
  const offset = Buffer.from(archive).indexOf("Original");
  expect(offset).toBeGreaterThan(0);
  archive[offset] = "X".charCodeAt(0);
  await expect(unpackArchive(archive)).rejects.toThrow();
});

it("rejects forged sizes, inconsistent names and duplicate entry paths", async () => {
  const base = zipSync({
    "ride.gpx": strToU8("<gpx>" + "x".repeat(128000) + "</gpx>"),
  });
  const central = Buffer.from(base).indexOf(
    Buffer.from([0x50, 0x4b, 0x01, 0x02]),
  );
  const short = Uint8Array.from(base),
    view = new DataView(short.buffer);
  view.setUint32(22, 1, true);
  view.setUint32(central + 24, 1, true);
  await expect(unpackArchive(short)).rejects.toThrow();
  const mismatch = Uint8Array.from(base);
  mismatch[30] = "X".charCodeAt(0);
  await expect(unpackArchive(mismatch)).rejects.toThrow();
  const duplicate = zipSync({
    "ride.gpx": strToU8("one"),
    "race.gpx": strToU8("two"),
  });
  const buffer = Buffer.from(duplicate);
  for (
    let offset = buffer.indexOf("race.gpx");
    offset !== -1;
    offset = buffer.indexOf("race.gpx", offset + 8)
  )
    buffer.write("ride.gpx", offset);
  await expect(unpackArchive(buffer)).rejects.toThrow();
});

it("enforces entry and aggregate bounds while preserving supported deflated bytes", async () => {
  const data = strToU8("unchanged original"),
    archive = zipSync({ "first.gpx": data, "second.tcx": data });
  const limits = { entries: 2, expandedBytes: 1000, fileBytes: 1000 };
  const result = await readArchiveFiles(archive, limits);
  expect(result.files.get("first.gpx")).toEqual(data);
  expect(result.files.get("second.tcx")).toEqual(data);
  await expect(
    readArchiveFiles(archive, { ...limits, entries: 1 }),
  ).rejects.toThrow("too many");
  await expect(
    readArchiveFiles(archive, { ...limits, expandedBytes: data.length }),
  ).rejects.toThrow("expansion");
});
