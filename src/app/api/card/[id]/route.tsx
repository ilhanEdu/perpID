import { ImageResponse } from "next/og";
import { getShare } from "@/lib/store";
import { CARD_SIZE, renderShareCard } from "@/lib/og-card";

export const runtime = "nodejs";

/**
 * GET /api/card/[id] — the shareable card as a downloadable PNG, identical
 * to the OG image for /share/[id].
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) {
    return Response.json({ error: "Share not found" }, { status: 404 });
  }
  return new ImageResponse(await renderShareCard(share), CARD_SIZE);
}
