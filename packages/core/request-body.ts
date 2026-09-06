/** Read a signed webhook body without buffering beyond its byte limit. */
export async function boundedRequestText(
  request: Request,
  limit = 1_000_000,
): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) {
    await request.body?.cancel();
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
