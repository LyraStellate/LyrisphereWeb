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
    });
  }

  return NextResponse.json({
    title: item.title,
    composer: "-", // Can be fetched from Youtube if we store it
    release_date: "-", // Can be fetched from Youtube if we store it
    provider_name: item.folder.user.username,
    folder_name: item.folder.name,
  });
}
