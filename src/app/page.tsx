import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;

  if (!sessionId) {
    return (
      <div className="glass-panel" style={{ padding: "40px", textAlign: "center", marginTop: "10vh" }}>
        <h1 style={{ marginBottom: "20px" }}>Lyrisphere へようこそ</h1>
        <p style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
          VRChat内のワールドに表示されている専用URLからアクセスしてください。<br />
          URLを開くことで自動的にログインが完了します。
        </p>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionId },
    include: {
      folders: {
        orderBy: { order: 'asc' },
        include: {
          items: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return (
      <div className="glass-panel" style={{ padding: "40px", textAlign: "center", marginTop: "10vh" }}>
        <h1 style={{ marginBottom: "20px" }}>ログインセッションが無効です</h1>
        <p style={{ color: "var(--text-muted)", lineHeight: "1.6" }}>
          URLが再発行されたか、セッションが期限切れです。<br />
          VRChat内から新しいURLを取得してアクセスし直してください。
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "100px", paddingTop: "40px" }}>
      <Dashboard initialUser={user} />
    </div>
  );
}
