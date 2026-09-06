import { expect, it } from "vitest";
import { boundedRequestText } from "./request-body";
it("preserves signed UTF-8 payloads across stream boundaries and enforces bytes rather than character counts", async () => {
  const body = '{"name":"🚲é"}',
    bytes = new TextEncoder().encode(body);
  const request = () =>
    new Request("https://example.invalid/webhook", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, 11));
          c.enqueue(bytes.slice(11));
          c.close();
        },
      }),
    } as RequestInit);
  expect(await boundedRequestText(request(), bytes.length)).toBe(body);
  expect(await boundedRequestText(request(), body.length)).toBeNull();
});
it("rejects oversized bodies even with missing or dishonest content length and cancels further reads", async () => {
  for (const length of [undefined, "1", "1000001"]) {
    let canceled = false;
    const request = new Request("https://example.invalid/webhook", {
      method: "POST",
      duplex: "half",
      headers: length ? { "content-length": length } : {},
      body: new ReadableStream({
        pull(c) {
          c.enqueue(new Uint8Array(600000));
        },
        cancel() {
          canceled = true;
        },
      }),
    } as RequestInit);
    expect(await boundedRequestText(request)).toBeNull();
    expect(canceled).toBe(true);
  }
});
