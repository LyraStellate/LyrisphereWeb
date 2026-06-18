import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decodeUdonId } from "@/lib/crypto";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const idParam = searchParams.get("id");
  const userAgent = request.headers.get("user-agent") || "";

  if (!idParam) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // 1. Decode ID and find/create user
  let user = null;
  const decodedStr = decodeUdonId(idParam);

  if (!decodedStr) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Decoded string is the username
  const username = decodedStr;
  const expectedId = idParam; // The Base64 string itself
  user = await prisma.user.findFirst({
    where: {
      username: username,
      platform: "vrchat",
    },
  });

  if (!user) {
    // First time login
    user = await prisma.user.create({
      data: {
        username: username,
        platform: "vrchat",
        isActive: true,
        lastBeatAt: new Date(0),
        folders: {
          create: {
            name: "すき！",
            isSystem: true,
            order: 9999, // Ensure it's at the end
          }
        }
      },
    });
  } else {
    // Check if existing user has the system folder, if not, create it
    const systemFolder = await prisma.playlistFolder.findFirst({
      where: { userId: user.id, isSystem: true }
    });
    if (!systemFolder) {
      await prisma.playlistFolder.create({
        data: {
          userId: user.id,
          name: "すき！",
          isSystem: true,
          order: 9999,
        }
      });
    }
  }

  // 2. Branch by User-Agent
  const isVRChat = userAgent.includes("VRChat") || userAgent.includes("UnityPlayer");

  if (isVRChat) {
    // VRChat Heartbeat
    await prisma.user.update({
      where: { id: user.id },
      data: { lastBeatAt: new Date() },
    });
    // Return empty 200 OK to save bandwidth
    return new NextResponse(null, { status: 200 });
  } else {
    // Browser Login -> Set cookie and redirect to My Page
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;
    const response = NextResponse.redirect(new URL("/", baseUrl));
    
    response.cookies.set("sessionId", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });
    return response;
  }
}
