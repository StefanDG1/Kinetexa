export function GET() {
  return Response.json(
    { status: "ok", service: "kinetexa-web" },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
