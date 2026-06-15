"use client";

import { useState } from "react";
import { createFolder, deleteFolder, addPlaylistItem, deletePlaylistItem, reissueUrl } from "@/app/actions";

type PlaylistItem = {
  id: string;
  url: string;
  title: string;
  platform: string;
  thumbnailUrl: string | null;
};

type PlaylistFolder = {
  id: string;
  name: string;
  items: PlaylistItem[];
};

type User = {
  id: string;
  username: string;
  folders: PlaylistFolder[];
};

export default function Dashboard({ initialUser }: { initialUser: User }) {
  const [user, setUser] = useState(initialUser);
  const [newFolderName, setNewFolderName] = useState("");
  const [newUrls, setNewUrls] = useState<Record<string, string>>({});
  const [isReissuing, setIsReissuing] = useState(false);
  const [reissuedUrl, setReissuedUrl] = useState<string | null>(null);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(user.id, newFolderName);
    setNewFolderName("");
    // In a real app, we might want to refresh the page or rely on revalidatePath to trigger a reload.
    // For simplicity, we just trigger a hard reload.
    window.location.reload();
  };

  const handleAddUrl = async (folderId: string) => {
    const url = newUrls[folderId];
    if (!url || !url.trim()) return;
    await addPlaylistItem(folderId, url, user.username);
    setNewUrls({ ...newUrls, [folderId]: "" });
    window.location.reload();
  };

  const handleReissue = async () => {
    if (!confirm("現在のURLを無効化し、新しいURLを発行しますか？ VRChat内での再入力が必要になります。")) return;
    setIsReissuing(true);
    const res = await reissueUrl(user.id);
    if (res.success) {
      setReissuedUrl(res.newId);
    }
    setIsReissuing(false);
  };

  if (reissuedUrl) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: "40px", textAlign: "center" }}>
        <h2 style={{ color: "var(--primary)", marginBottom: "20px" }}>URLを再発行しました</h2>
        <p style={{ marginBottom: "20px" }}>
          以下の新しい専用URLをコピーし、VRChat内の VRCUrl InputField にペーストしてください。<br />
          <strong style={{ color: "#EF4444" }}>※以前のURLは使用できなくなりました。</strong>
        </p>
        <div style={{ background: "rgba(0,0,0,0.05)", padding: "20px", borderRadius: "8px", wordBreak: "break-all", marginBottom: "20px" }}>
          <code>https://lyrisphere.lyrastellate.dev/api/login?id={reissuedUrl}</code>
        </div>
        <button className="btn-primary" onClick={() => window.location.href = `/api/login?id=${reissuedUrl}`}>
          新しいセッションでログインする
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="glass-panel" style={{ padding: "30px", marginBottom: "30px" }}>
        <h2 style={{ marginBottom: "20px" }}>新しいフォルダを作成</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            className="input-text"
            placeholder="フォルダ名 (例: テンション上がる曲)"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <button className="btn-primary" style={{ whiteSpace: "nowrap" }} onClick={handleCreateFolder}>
            作成
          </button>
        </div>
      </div>

      {user.folders.map((folder) => (
        <div key={folder.id} className="glass-panel" style={{ padding: "30px", marginBottom: "30px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2>{folder.name}</h2>
            <button className="btn-danger" onClick={async () => {
              if (confirm(`フォルダ「${folder.name}」を削除しますか？`)) {
                await deleteFolder(folder.id);
                window.location.reload();
              }
            }}>
              フォルダ削除
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <input
              type="text"
              className="input-text"
              placeholder="YouTube / Niconico URL を追加"
              value={newUrls[folder.id] || ""}
              onChange={(e) => setNewUrls({ ...newUrls, [folder.id]: e.target.value })}
            />
            <button className="btn-primary" style={{ whiteSpace: "nowrap" }} onClick={() => handleAddUrl(folder.id)}>
              追加
            </button>
          </div>

          {folder.items.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>楽曲がありません。</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {folder.items.map((item) => (
                <li key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "15px", overflow: "hidden" }}>
                    {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="thumbnail" style={{ width: "80px", height: "45px", objectFit: "cover", borderRadius: "4px" }} />}
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <p style={{ fontWeight: "600", margin: 0, textOverflow: "ellipsis", overflow: "hidden" }}>{item.title}</p>
                      <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.85rem", color: "var(--primary)", textDecoration: "none" }}>{item.url}</a>
                    </div>
                  </div>
                  <button className="btn-danger" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={async () => {
                    await deletePlaylistItem(item.id);
                    window.location.reload();
                  }}>
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div style={{ textAlign: "right", marginTop: "50px" }}>
        <button className="btn-danger" onClick={handleReissue} disabled={isReissuing}>
          {isReissuing ? "処理中..." : "URLを再発行して現在のIDを無効化する"}
        </button>
      </div>
    </div>
  );
}
