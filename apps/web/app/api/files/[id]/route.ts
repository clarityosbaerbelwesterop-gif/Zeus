import { getWorkspaceFile } from "@/lib/product";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const file = await getWorkspaceFile(id);
    return new Response(new Uint8Array(file.body), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.body.byteLength),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-zeus-checksum": file.checksum,
      },
    });
  } catch {
    return Response.json({ error: "File not found or access denied." }, { status: 404 });
  }
}
