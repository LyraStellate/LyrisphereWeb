"use server";

import prisma from "@/lib/prisma";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { randomUUID } from "crypto";

function parseYTDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

export async function createFolder(userId: string, name: string) {
  if (!name.trim()) return { error: "フォルダ名を入力してください" };
  
  // Find max order to append at the end
  const maxFolder = await prisma.playlistFolder.findFirst({
    where: { userId },
    orderBy: { order: 'desc' },
  });
  const newOrder = maxFolder ? maxFolder.order + 1 : 0;

  await prisma.playlistFolder.create({
    data: { name: name.trim(), userId, order: newOrder },
  });
  revalidatePath("/");
  return { success: true };
}

export async function renameFolder(folderId: string, newName: string) {
  if (!newName.trim()) return { error: "フォルダ名を入力してください" };
  await prisma.playlistFolder.update({
    where: { id: folderId },
    data: { name: newName.trim() },
  });
  revalidatePath("/");
  return { success: true };
}

export async function toggleFolderActive(folderId: string, isActive: boolean) {
  await prisma.playlistFolder.update({
    where: { id: folderId },
    data: { isActive },
  });
  revalidatePath("/");
  return { success: true };
}

export async function deleteFolder(folderId: string) {
  // フォルダ内のアイテムも削除
  await prisma.playlistItem.deleteMany({ where: { folderId } });
  await prisma.playlistFolder.delete({ where: { id: folderId } });
  revalidatePath("/");
  return { success: true };
}

export async function addPlaylistItem(folderId: string, url: string, addedBy: string) {
  if (!url.trim()) return { error: "URLを入力してください" };

  let title = "Unknown Title";
  let platform = "other";
  let thumbnailUrl: string | null = null;
  let providerName = addedBy;
  let releaseDate: string | null = null;
  let duration: number | null = null;
  let description: string | null = null;
  let tags: string | null = null;
  let viewCount: number | null = null;
  let likeCount: number | null = null;
  let commentCount: number | null = null;

  try {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      platform = "youtube";
      const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
      if (ytMatch && process.env.YOUTUBE_API_KEY) {
        const videoId = ytMatch[1];
        const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          if (ytData.items && ytData.items.length > 0) {
            const snippet = ytData.items[0].snippet;
            const contentDetails = ytData.items[0].contentDetails;
            const statistics = ytData.items[0].statistics;
            title = snippet.title;
            thumbnailUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null;
            providerName = snippet.channelTitle || providerName;
            releaseDate = snippet.publishedAt || null;
            duration = contentDetails?.duration ? parseYTDuration(contentDetails.duration) : null;
            description = snippet.description || null;
            tags = snippet.tags ? snippet.tags.join(',') : null;
            viewCount = statistics?.viewCount ? parseInt(statistics.viewCount, 10) : null;
            likeCount = statistics?.likeCount ? parseInt(statistics.likeCount, 10) : null;
            commentCount = statistics?.commentCount ? parseInt(statistics.commentCount, 10) : null;
          } else {
            title = "YouTube Video (Not Found)";
          }
        } else {
          title = "YouTube Video (API Error)";
        }
      } else {
        title = "YouTube Video (No API Key)";
      }
    } else if (url.includes("nicovideo.jp")) {
      platform = "niconico";
      const videoIdMatch = url.match(/watch\/([a-zA-Z0-9_]+)/);
      if (videoIdMatch) {
        const videoId = videoIdMatch[1];
        const nicoRes = await fetch(`https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?actionTrackId=0_0`, {
          headers: {
            'x-frontend-id': '6',
            'x-frontend-version': '0'
          }
        });
        if (nicoRes.ok) {
          const data = await nicoRes.json();
          if (data && data.data && data.data.video) {
            title = data.data.video.title;
            const t = data.data.video.thumbnail;
            thumbnailUrl = t?.nvLargeUrl || t?.largeUrl || t?.url || null;
            providerName = data.data.owner?.nickname || data.data.channel?.name || providerName;
            releaseDate = data.data.video.registeredAt || null;
            duration = data.data.video.duration || null;
            description = data.data.video.description || null;
            tags = data.data.tag?.items ? data.data.tag.items.map((item: any) => item.name).join(',') : null;
            viewCount = data.data.video.count?.view || null;
            likeCount = data.data.video.count?.like || null;
            commentCount = data.data.video.count?.comment || null;
          }
        } else {
          title = "Niconico Video";
        }
      } else {
        title = "Niconico Video";
      }
    }
  } catch (e) {
    console.error("Failed to fetch metadata", e);
  }

  const maxItem = await prisma.playlistItem.findFirst({
    where: { folderId },
    orderBy: { order: 'desc' },
  });
  const newOrder = maxItem ? maxItem.order + 1 : 0;

  await prisma.playlistItem.create({
    data: {
      folderId,
      url: url.trim(),
      title,
      platform,
      providerName,
      thumbnailUrl,
      releaseDate,
      duration,
      description,
      tags,
      viewCount,
      likeCount,
      commentCount,
      order: newOrder,
    },
  });

  revalidatePath("/");
  return { success: true };
}

export async function deletePlaylistItem(itemId: string) {
  await prisma.playlistItem.delete({ where: { id: itemId } });
  revalidatePath("/");
  return { success: true };
}

export async function reorderFolders(folderIds: string[]) {
  // Use a transaction to update all folders' order fields
  const updates = folderIds.map((id, index) =>
    prisma.playlistFolder.update({
      where: { id },
      data: { order: index },
    })
  );
  await prisma.$transaction(updates);
  revalidatePath("/");
  return { success: true };
}

export async function reorderItems(itemIds: string[]) {
  const updates = itemIds.map((id, index) =>
    prisma.playlistItem.update({
      where: { id },
      data: { order: index },
    })
  );
  await prisma.$transaction(updates);
  revalidatePath("/");
  return { success: true };
}

export async function checkUserStatus(userId: string) {
  noStore();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastBeatAt: true },
  });
  
  if (!user || !user.lastBeatAt) return false;
  
  // Consider online if beat was received within the last 2 minutes (120,000 ms)
  const isOnline = Date.now() - user.lastBeatAt.getTime() < 120000;
  return isOnline;
}
