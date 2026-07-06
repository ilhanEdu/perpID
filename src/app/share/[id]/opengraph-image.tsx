import { ImageResponse } from "next/og";
import { getShare } from "@/lib/store";
import { CARD_SIZE, renderShareCard } from "@/lib/og-card";

export const runtime = "nodejs";
export const size = CARD_SIZE;
export const contentType = "image/png";
export const alt = "PerpID trader card";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await getShare(id);
  return new ImageResponse(await renderShareCard(share), size);
}
