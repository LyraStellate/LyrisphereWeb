import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

const FALLBACK_BGM_URL = "https://www.youtube.com/watch?v=jfKfPfyJRdk"; // Lofi Girl as fallback

export async function GET(request: NextRequest) {
  const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000;
  const activeTimeCutoff = new Date(Date.now() - ACTIVE_THRESHOLD_MS);

  // Check owner requirement
  const totalOwners = await prisma.user.count({ where: { isOwner: true } });
  if (totalOwners > 0) {
    const activeOwnersCount = await prisma.user.count({
      where: {
        isOwner: true,
        isActive: true,
        lastBeatAt: {
          gte: activeTimeCutoff,
        },
      },
    });
    
    if (activeOwnersCount === 0) {
      return NextResponse.redirect(FALLBACK_BGM_URL, 302);
    }
  }

  // Get current EventState
  const eventState = await prisma.eventState.findUnique({ where: { id: 1 } });
  
  if (!eventState || !eventState.currentVideoId) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

  const chosenItem = await prisma.playlistItem.findUnique({
    where: { id: eventState.currentVideoId },
  });

  if (!chosenItem) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

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
