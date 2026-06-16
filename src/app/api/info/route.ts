import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const eventState = await prisma.eventState.findUnique({
    where: { id: 1 },
  });

  if (!eventState || !eventState.currentVideoId) {
    return NextResponse.json({
      title: "No Video Playing",
      composer: "-",
      release_date: "-",
      provider_name: "System",
      folder_name: "-",
      added_by_users: [],
      liked_by_users: [],
    });
  }

  const item = await prisma.playlistItem.findUnique({
    where: { id: eventState.currentVideoId },
    include: {
      folder: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json({
      title: "Unknown Video",
      composer: "-",
      release_date: "-",
      provider_name: "System",
      folder_name: "-",
      added_by_users: [],
      liked_by_users: [],
    });
  }

  const allItemsWithSameUrl = await prisma.playlistItem.findMany({
    where: { url: item.url },
    include: {
      folder: {
        include: {
          user: true,
        },
      },
    },
  });

  const addedByUsers = new Set<string>();
  const likedByUsers = new Set<string>();

  allItemsWithSameUrl.forEach((i) => {
    if (i.folder.isSystem) {
      likedByUsers.add(i.folder.user.username);
    } else {
      addedByUsers.add(i.folder.user.username);
    }
  });

  return NextResponse.json({
    title: item.title,
    composer: item.providerName,
    release_date: item.releaseDate || "-",
    provider_name: item.folder.user.username,
    folder_name: item.folder.name,
    added_by_users: Array.from(addedByUsers),
    liked_by_users: Array.from(likedByUsers),
  });
}
