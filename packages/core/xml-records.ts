import sax from "sax";

type Xml = Record<string, any>;
type Frame = { name: string; data?: Xml; text: string };
const local = (name: string) => name.split(":").at(-1)!;

// Keep only one point and the selected part's metadata in the XML tree.
// Point records are emitted and discarded before the next record is read.
export function scanActivityXml(
  bytes: Uint8Array,
  kind: "gpx" | "tcx",
  selected: number,
  onPoint?: (point: Xml, breakBefore: boolean) => void,
) {
  const reader = sax.parser(true, { position: false });
  const stack: Frame[] = [];
  const partPath =
    kind === "gpx" ? "gpx/trk" : "TrainingCenterDatabase/Activities/Activity";
  const pointPath =
    kind === "gpx"
      ? `${partPath}/trkseg/trkpt`
      : `${partPath}/Lap/Track/Trackpoint`;
  let count = 0,
    active = -1,
    part: Xml | undefined,
    firstPoint = false,
    trackIndex = 0;
  reader.onerror = () => {
    throw new Error("XML is malformed.");
  };
  reader.ondoctype = reader.onsgmldeclaration = () => {
    throw new Error("XML declarations with entities are not allowed.");
  };
  reader.onopentag = (tag) => {
    if (stack.length >= 64) throw new Error("XML nesting limit exceeded.");
    const name = local(tag.name);
    const path = [...stack.map((f) => f.name), name].join("/");
    if (path === partPath) active = count++;
    const data: Xml | undefined =
      active === selected && selected >= 0 ? Object.create(null) : undefined;
    if (data)
      for (const [key, value] of Object.entries(tag.attributes)) {
        if (key === "xmlns" || key.startsWith("xmlns:")) continue;
        data[`@_${local(key)}`] =
          typeof value === "string" ? value : value.value;
      }
    stack.push({ name, data, text: "" });
    if (path === `${partPath}/Lap`) trackIndex = 0;
    if (path === `${partPath}/trkseg`) firstPoint = true;
    if (path === `${partPath}/Lap/Track`) firstPoint = trackIndex++ > 0;
  };
  const text = (value: string) => {
    const frame = stack.at(-1);
    if (frame?.data) frame.text += value;
  };
  reader.ontext = reader.oncdata = text;
  reader.onclosetag = () => {
    const path = stack.map((f) => f.name).join("/");
    const frame = stack.pop()!;
    if (frame.data) {
      const text = frame.text.trim();
      const value = Object.keys(frame.data).length ? frame.data : text;
      if (typeof value === "object" && text) value["#text"] = text;
      if (path === pointPath) {
        onPoint?.(typeof value === "object" ? value : {}, firstPoint);
        firstPoint = false;
      } else if (path === partPath) part = frame.data;
      else {
        const parent = stack.at(-1)?.data;
        if (parent) {
          const prior = parent[frame.name];
          if (prior === undefined) parent[frame.name] = value;
          else if (Array.isArray(prior)) prior.push(value);
          else parent[frame.name] = [prior, value];
        }
      }
    }
    if (path === partPath) active = -1;
  };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let offset = 0; offset < bytes.length; offset += 65536)
    reader.write(
      decoder.decode(bytes.subarray(offset, offset + 65536), { stream: true }),
    );
  reader.write(decoder.decode()).close();
  return { count, part };
}
