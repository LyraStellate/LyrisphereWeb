import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decodeUdonId } from "@/lib/crypto";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const idParam = searchParams.get("id");

  if (!idParam) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // 1. Decode ID and find user
  const decodedStr = decodeUdonId(idParam);
  if (!decodedStr) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const username = decodedStr;
  const user = await prisma.user.findFirst({
    where: { username },
    include: { folders: true }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // 2. Find system folder "すき！"
  let systemFolder = user.folders.find(f => f.isSystem);
  if (!systemFolder) {
    systemFolder = await prisma.playlistFolder.create({
      data: {
        userId: user.id,
        name: "すき！",
        isSystem: true,
        order: 9999,
      }
    });
  }

  // 3. Get currently playing video
  const eventState = await prisma.eventState.findUnique({
    where: { id: 1 }
  });

  if (!eventState || !eventState.currentVideoId) {
    return NextResponse.json({ error: "No video is currently playing" }, { status: 400 });
  }

  const currentItem = await prisma.playlistItem.findUnique({
    where: { id: eventState.currentVideoId }
  });

  if (!currentItem) {
    return NextResponse.json({ error: "Playing video not found" }, { status: 404 });
  }

  // 4. Check if the url is already in the system folder
  const existingItem = await prisma.playlistItem.findFirst({
    where: {
      folderId: systemFolder.id,
      url: currentItem.url
    }
  });

  if (existingItem) {
    // Already liked, so un-like (remove it)
    await prisma.playlistItem.delete({
      where: { id: existingItem.id }
    });
    return NextResponse.json({ status: "unliked", item: currentItem.title });
  } else {
    // Add to like folder
    await prisma.playlistItem.create({
      data: {
        folderId: systemFolder.id,
        url: currentItem.url,
        title: currentItem.title,
        thumbnailUrl: currentItem.thumbnailUrl,
        providerName: currentItem.providerName,
        platform: currentItem.platform,
        releaseDate: currentItem.releaseDate,
        duration: currentItem.duration,
        description: currentItem.description,
        tags: currentItem.tags,
        viewCount: currentItem.viewCount,
        likeCount: currentItem.likeCount,
        commentCount: currentItem.commentCount,
        order: await prisma.playlistItem.count({ where: { folderId: systemFolder.id } })
      }
    });
    return NextResponse.json({ status: "liked", item: currentItem.title });
  }
}
