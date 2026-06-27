"use server";

import prisma from "@/lib/prisma";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { decodeUdonId } from "@/lib/crypto";

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

function normalizeMediaInput(input: string) {
  let normalizedUrl = input.trim();
  let platform = "other";
  let videoId: string | null = null;

  if (/^(sm|nm|so)\d+$/.test(normalizedUrl)) {
    platform = "niconico";
    videoId = normalizedUrl;
    normalizedUrl = `https://www.nicovideo.jp/watch/${videoId}`;
    return { normalizedUrl, platform, videoId };
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(normalizedUrl)) {
    platform = "youtube";
    videoId = normalizedUrl;
    normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return { normalizedUrl, platform, videoId };
  }

  if (normalizedUrl.includes("youtube.com") || normalizedUrl.includes("youtu.be")) {
    const ytMatch = normalizedUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch) {
      platform = "youtube";
      videoId = ytMatch[1];
      normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
      return { normalizedUrl, platform, videoId };
    }
  }

  if (normalizedUrl.includes("nicovideo.jp")) {
    const nicoMatch = normalizedUrl.match(/watch\/([a-zA-Z0-9_]+)/);
    if (nicoMatch) {
      platform = "niconico";
      videoId = nicoMatch[1];
      normalizedUrl = `https://www.nicovideo.jp/watch/${videoId}`;
      return { normalizedUrl, platform, videoId };
    }
  }

  return { normalizedUrl, platform, videoId };
}

async function fetchMediaMetadata(platform: string, videoId: string | null, fallbackProviderName: string) {
  let metadata = {
    title: "Unknown Title",
    thumbnailUrl: null as string | null,
    providerName: fallbackProviderName,
    releaseDate: null as string | null,
    duration: null as number | null,
    description: null as string | null,
    tags: null as string | null,
    viewCount: null as number | null,
    likeCount: null as number | null,
    commentCount: null as number | null,
  };

  try {
    if (platform === "youtube" && videoId) {
      if (process.env.YOUTUBE_API_KEY) {
        const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          if (ytData.items && ytData.items.length > 0) {
            const snippet = ytData.items[0].snippet;
            const contentDetails = ytData.items[0].contentDetails;
            const statistics = ytData.items[0].statistics;
            metadata.title = snippet.title;
            metadata.thumbnailUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null;
            metadata.providerName = snippet.channelTitle || fallbackProviderName;
            metadata.releaseDate = snippet.publishedAt || null;
            metadata.duration = contentDetails?.duration ? parseYTDuration(contentDetails.duration) : null;
            metadata.description = snippet.description || null;
            metadata.tags = snippet.tags ? snippet.tags.join(',') : null;
            metadata.viewCount = statistics?.viewCount ? parseInt(statistics.viewCount, 10) : null;
            metadata.likeCount = statistics?.likeCount ? parseInt(statistics.likeCount, 10) : null;
            metadata.commentCount = statistics?.commentCount ? parseInt(statistics.commentCount, 10) : null;
          } else {
            metadata.title = "YouTube Video (Not Found)";
          }
        } else {
          metadata.title = "YouTube Video (API Error)";
        }
      } else {
        metadata.title = "YouTube Video (No API Key)";
      }
    } else if (platform === "niconico" && videoId) {
      const nicoRes = await fetch(`https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?actionTrackId=0_0`, {
        headers: {
          'x-frontend-id': '6',
          'x-frontend-version': '0'
        }
      });
      if (nicoRes.ok) {
        const data = await nicoRes.json();
        if (data && data.data && data.data.video) {
          metadata.title = data.data.video.title;
          const t = data.data.video.thumbnail;
          metadata.thumbnailUrl = t?.nvLargeUrl || t?.largeUrl || t?.url || null;
          metadata.providerName = data.data.owner?.nickname || data.data.channel?.name || fallbackProviderName;
          metadata.releaseDate = data.data.video.registeredAt || null;
          metadata.duration = data.data.video.duration || null;
          metadata.description = data.data.video.description || null;
          metadata.tags = data.data.tag?.items ? data.data.tag.items.map((item: any) => item.name).join(',') : null;
          metadata.viewCount = data.data.video.count?.view || null;
          metadata.likeCount = data.data.video.count?.like || null;
          metadata.commentCount = data.data.video.count?.comment || null;
        }
      } else {
        metadata.title = "Niconico Video";
      }
    }
  } catch (e) {
    console.error("Failed to fetch metadata", e);
  }
  return metadata;
}

export async function addPlaylistItem(folderId: string, url: string, addedBy: string) {
  if (!url.trim()) return { error: "URLを入力してください" };

  const { normalizedUrl, platform, videoId } = normalizeMediaInput(url);
  const metadata = await fetchMediaMetadata(platform, videoId, addedBy);

  const maxItem = await prisma.playlistItem.findFirst({
    where: { folderId },
    orderBy: { order: 'desc' },
  });
  const newOrder = maxItem ? maxItem.order + 1 : 0;

  await prisma.playlistItem.create({
    data: {
      folderId,
      url: normalizedUrl,
      platform,
      title: metadata.title,
      providerName: metadata.providerName,
      thumbnailUrl: metadata.thumbnailUrl,
      releaseDate: metadata.releaseDate,
      duration: metadata.duration,
      description: metadata.description,
      tags: metadata.tags,
      viewCount: metadata.viewCount,
      likeCount: metadata.likeCount,
      commentCount: metadata.commentCount,
      order: newOrder,
    },
  });

  revalidatePath("/");
  return { success: true };
}

export async function refreshPlaylistItem(itemId: string) {
  const item = await prisma.playlistItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: "Item not found" };

  const { normalizedUrl, platform, videoId } = normalizeMediaInput(item.url);
  const metadata = await fetchMediaMetadata(platform, videoId, item.providerName);

  await prisma.playlistItem.update({
    where: { id: itemId },
    data: {
      url: normalizedUrl,
      platform,
      title: metadata.title,
      providerName: metadata.providerName,
      thumbnailUrl: metadata.thumbnailUrl,
      releaseDate: metadata.releaseDate,
      duration: metadata.duration,
      description: metadata.description,
      tags: metadata.tags,
      viewCount: metadata.viewCount,
      likeCount: metadata.likeCount,
      commentCount: metadata.commentCount,
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

export async function movePlaylistItem(itemId: string, newFolderId: string) {
  const maxItem = await prisma.playlistItem.findFirst({
    where: { folderId: newFolderId },
    orderBy: { order: 'desc' },
  });
  const newOrder = maxItem ? maxItem.order + 1 : 0;

  await prisma.playlistItem.update({
    where: { id: itemId },
    data: {
      folderId: newFolderId,
      order: newOrder,
    },
  });

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

export async function migrateAccount(currentUserId: string, newIdParam: string) {
  const decodedUsername = decodeUdonId(newIdParam);
  if (!decodedUsername) {
    return { error: "無効なIDです。VRChatで表示されている正しいIDを入力してください。" };
  }

  const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } });
  if (!currentUser) return { error: "現在のユーザーが見つかりません。" };

  if (decodedUsername === currentUser.username) {
    return { error: "同じユーザー名への移行はできません。" };
  }

  let destinationUser = await prisma.user.findFirst({ where: { username: decodedUsername, platform: "vrchat" } });

  // If destination user doesn't exist, create it
  if (!destinationUser) {
    destinationUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        username: decodedUsername,
        platform: "vrchat",
        isActive: true,
        lastBeatAt: new Date(0),
      },
    });

    await prisma.playlistFolder.createMany({
      data: [
        {
          userId: destinationUser.id,
          name: "デフォルトフォルダ",
          isSystem: false,
          order: 0,
        },
        {
          userId: destinationUser.id,
          name: "すき！",
          isSystem: true,
          order: 9999,
        }
      ]
    });
  }

  // Handle system folder merging
  const currentSystemFolder = await prisma.playlistFolder.findFirst({
    where: { userId: currentUserId, isSystem: true }
  });
  const destinationSystemFolder = await prisma.playlistFolder.findFirst({
    where: { userId: destinationUser.id, isSystem: true }
  });

  if (currentSystemFolder && destinationSystemFolder) {
    // Move all items from current system folder to destination system folder
    await prisma.playlistItem.updateMany({
      where: { folderId: currentSystemFolder.id },
      data: { folderId: destinationSystemFolder.id }
    });
  }

  // Handle regular folders: move them to the new user
  await prisma.playlistFolder.updateMany({
    where: { userId: currentUserId, isSystem: false },
    data: { userId: destinationUser.id }
  });

  // EventState cleanup
  const eventState = await prisma.eventState.findFirst();
  if (eventState?.lastChosenUserId === currentUserId) {
    await prisma.eventState.update({
      where: { id: 1 },
      data: { lastChosenUserId: destinationUser.id }
    });
  }

  // Delete old user
  // Delete system folder first to satisfy constraints if any (SQLite doesn't strictly need it but good practice)
  if (currentSystemFolder) {
    await prisma.playlistItem.deleteMany({ where: { folderId: currentSystemFolder.id } }); // Should be empty now
    await prisma.playlistFolder.delete({ where: { id: currentSystemFolder.id } });
  }

  await prisma.user.delete({ where: { id: currentUserId } });

  // Update session cookie
  const cookieStore = await cookies();
  cookieStore.set("sessionId", destinationUser.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return { success: true };
}
