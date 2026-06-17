import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

const FALLBACK_BGM_URL = "https://www.youtube.com/watch?v=jfKfPfyJRdk"; // Lofi Girl as fallback

export async function GET(request: NextRequest) {
  const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000;
  const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
  const activeTimeCutoff = new Date(Date.now() - ACTIVE_THRESHOLD_MS);
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS);

  // Get current EventState to know the last chosen user
  const eventState = await prisma.eventState.findUnique({ where: { id: 1 } });
  const lastChosenUserId = eventState?.lastChosenUserId;

  // Get active users and their active folders
  const activeUsers = await prisma.user.findMany({
    where: {
      lastBeatAt: {
        gte: activeTimeCutoff,
      },
      isActive: true,
    },
    include: {
      folders: {
        where: { isActive: true },
        include: {
          items: true,
        },
      },
    },
  });

  // Check owner requirement
  const totalOwners = await prisma.user.count({ where: { isOwner: true } });
  const ownerActive = activeUsers.some(u => u.isOwner);
  if (totalOwners > 0 && !ownerActive) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

  // Helper to get eligible items for a user
  const getEligibleItems = (user: any, useCooldown: boolean) => {
    let items: any[] = [];
    user.folders.forEach((folder: any) => {
      folder.items.forEach((item: any) => {
        if (!useCooldown || !item.lastPlayedAt || new Date(item.lastPlayedAt) < cooldownCutoff) {
          items.push(item);
        }
      });
    });
    return items;
  };

  // Step 1: Find users who have at least one eligible item (respecting cooldown)
  let candidateUsers = activeUsers.filter(u => getEligibleItems(u, true).length > 0);
  let useCooldown = true;

  // Step 2: If no one has eligible songs, lift cooldown restriction (Fallback A)
  if (candidateUsers.length === 0) {
    candidateUsers = activeUsers.filter(u => getEligibleItems(u, false).length > 0);
    useCooldown = false;
  }

  // Step 3: If STILL no candidates (no songs at all), fallback BGM
  if (candidateUsers.length === 0) {
    return NextResponse.redirect(FALLBACK_BGM_URL, 302);
  }

  // Step 4: Avoid consecutive user selection if there are multiple candidates
  let finalCandidates = candidateUsers;
  if (candidateUsers.length > 1 && lastChosenUserId) {
    const filtered = candidateUsers.filter(u => u.id !== lastChosenUserId);
    if (filtered.length > 0) {
      finalCandidates = filtered;
    }
  }

  // Step 5: Uniformly select a user from the final candidates
  const chosenUser = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];

  // Step 6: Select a random eligible item from that user
  const userItems = getEligibleItems(chosenUser, useCooldown);
  const chosenItem = userItems[Math.floor(Math.random() * userItems.length)];

  // Step 7: Record the selection in DB
  await prisma.eventState.upsert({
    where: { id: 1 },
    update: {
      currentVideoId: chosenItem.id,
      lastChosenUserId: chosenUser.id,
      lastUpdatedAt: new Date(),
    },
    create: {
      id: 1,
      currentVideoId: chosenItem.id,
      lastChosenUserId: chosenUser.id,
    },
  });

  await prisma.playlistItem.update({
    where: { id: chosenItem.id },
    data: { lastPlayedAt: new Date() },
  });

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
