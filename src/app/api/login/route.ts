import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decodeUdonId, isUuid } from "@/lib/crypto";

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

  if (isUuid(decodedStr)) {
    // Reissued UUID
    user = await prisma.user.findUnique({ where: { id: decodedStr } });
    if (!user) {
      return NextResponse.json({ error: "User not found for this UUID" }, { status: 404 });
    }
  } else {
    // Decoded string is the username
    const username = decodedStr;
    // Find active user by username where ID is NOT a UUID (meaning they haven't reissued)
    // Actually, if they reissued, their isActive is true for their UUID, and false for this username-based one.
    // Wait, let's look up if there's any active user with this username.
    // The Udon ID format is always the same for a username.
    const expectedId = idParam; // The Base64 string itself
    user = await prisma.user.findFirst({
      where: {
        username: username,
      },
    });

    if (!user) {
      // First time login
      user = await prisma.user.create({
        data: {
          id: expectedId,
          username: username,
          isActive: true,
        },
      });
    } else {
      // Check if user has reissued (if their current active ID is a UUID, they cannot use the XOR ID)
      if (user.isActive && isUuid(user.id)) {
         return NextResponse.json({ error: "This URL has been revoked. Please use your reissued URL." }, { status: 403 });
      }
      // If user's ID in DB doesn't match and they haven't reissued, maybe update? 
      // It should match if they haven't reissued.
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
    const response = NextResponse.redirect(new URL("/", request.url));
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
