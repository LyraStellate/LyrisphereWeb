import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decodeLocalUserId } from "@/lib/crypto";

export const dynamic = 'force-dynamic';

const FALLBACK_BGM_URL = "https://www.youtube.com/watch?v=jfKfPfyJRdk"; // Lofi Girl as fallback

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  // Await params to support both Next.js 14 and 15
  const resolvedParams = await Promise.resolve(params);
  const idParam = resolvedParams.id;

  if (!idParam) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const decoded = decodeLocalUserId(idParam);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { platform, username } = decoded;

  const user = await prisma.user.findFirst({
    where: { username, platform },
    include: {
      folders: {
        where: { isActive: true },
        include: {
          items: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

  // Get all items from active folders
  const allItems = user.folders.flatMap(folder => folder.items);

  if (allItems.length === 0) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

  // Random pick
  const randomIndex = Math.floor(Math.random() * allItems.length);
  const chosenItem = allItems[randomIndex];

  // Update lastPlayedAt to reflect it was played (optional but good practice)
  await prisma.playlistItem.update({
    where: { id: chosenItem.id },
    data: { lastPlayedAt: new Date() }
  }).catch(() => {}); // Ignore errors

  // Generate final URL
  let finalUrl = chosenItem.url;
  if (chosenItem.platform === 'niconico') {
    const match = chosenItem.url.match(/watch\/([a-zA-Z0-9_]+)/);
    if (match) {
      finalUrl = `https://www.nicovideo.life/watch?v=${match[1]}`;
    }
  }

  return NextResponse.redirect(finalUrl, 302);
}
