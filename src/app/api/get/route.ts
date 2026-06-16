import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const FALLBACK_BGM_URL = "https://www.youtube.com/watch?v=jfKfPfyJRdk"; // Lofi Girl as fallback

export async function GET(request: NextRequest) {
  // Define active threshold (e.g., beat within the last 2 minutes)
  const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000;
  const activeTimeCutoff = new Date(Date.now() - ACTIVE_THRESHOLD_MS);

  // Get active users
  const activeUsers = await prisma.user.findMany({
    where: {
      lastBeatAt: {
        gte: activeTimeCutoff,
      },
      isActive: true,
    },
    include: {
      folders: {
        include: {
          items: true,
        },
      },
    },
  });

  // Check if owner is active (if required by logic, though specification says:
  // "オーナー不在時の停止: サーバー側の api/get において、イベントオーナーのビートが一定時間確認できない場合は、システムを待機状態にする")
  const ownerActive = activeUsers.some(u => u.isOwner);
  // If there's an owner defined in the system but no owner is active, maybe we fallback.
  // We'll just check if any user has `isOwner = true`. If the DB has owners, at least one must be active.
  const totalOwners = await prisma.user.count({ where: { isOwner: true } });
  if (totalOwners > 0 && !ownerActive) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

  // Collect all playlist items from all active users
  let allItems: any[] = [];
  activeUsers.forEach(user => {
    user.folders.forEach(folder => {
      if (folder.isActive) {
        folder.items.forEach(item => {
          allItems.push({
            ...item,
            providerName: user.username,
            folderName: folder.name,
          });
        });
      }
    });
  });

  if (allItems.length === 0) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

  // Pick one randomly
  const randomIndex = Math.floor(Math.random() * allItems.length);
  const selectedItem = allItems[randomIndex];

  // Update EventState
  await prisma.eventState.upsert({
    where: { id: 1 },
    update: {
      currentVideoId: selectedItem.id,
      lastUpdatedAt: new Date(),
    },
    create: {
      id: 1,
      currentVideoId: selectedItem.id,
    },
  });

  let finalUrl = selectedItem.url;
  if (selectedItem.platform === 'niconico') {
    const match = selectedItem.url.match(/watch\/([a-zA-Z0-9_]+)/);
    if (match) {
      finalUrl = `https://www.nicovideo.life/watch?v=${match[1]}`;
    }
  }

  return NextResponse.redirect(finalUrl, 302);
}
