"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export async function createFolder(userId: string, name: string) {
  if (!name.trim()) return { error: "フォルダ名を入力してください" };
  await prisma.playlistFolder.create({
    data: { name: name.trim(), userId },
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

export async function addPlaylistItem(folderId: string, url: string, providerName: string) {
  if (!url.trim()) return { error: "URLを入力してください" };

  let title = "Unknown Title";
  let platform = "other";
  let thumbnailUrl = null;

  try {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      platform = "youtube";
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title;
        thumbnailUrl = data.thumbnail_url;
      } else {
        title = "YouTube Video";
      }
    } else if (url.includes("nicovideo.jp")) {
      platform = "niconico";
      title = "Niconico Video"; // Fetching Niconico metadata server-side requires XML parsing, keeping simple for now
    }
  } catch (e) {
    console.error("Failed to fetch metadata", e);
  }

  await prisma.playlistItem.create({
    data: {
      folderId,
      url: url.trim(),
      title,
      platform,
      providerName,
      thumbnailUrl,
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

export async function reissueUrl(userId: string) {
  // 新しいUUIDを発行し、現在のユーザーのIDを書き換える
  const newId = randomUUID();
  await prisma.user.update({
    where: { id: userId },
    data: {
      id: newId,
      // isActive is kept true for the new UUID
    },
  });

  // Note: changing the ID will invalidate the current session cookie
  // The client will need to log out or we update the cookie.
  // Actually, we can just return the new ID, and the client will show it to the user.
  // The session cookie might break, so we should probably keep the old user record as inactive,
  // and create a NEW user record? No, updating the ID is simpler, but session will drop on next refresh.
  return { success: true, newId };
}
