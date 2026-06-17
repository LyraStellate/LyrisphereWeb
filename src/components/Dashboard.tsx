"use client";

import { useState, useTransition, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createFolder, deleteFolder, addPlaylistItem, deletePlaylistItem, checkUserStatus, renameFolder, reorderFolders, reorderItems, toggleFolderActive, movePlaylistItem, refreshPlaylistItem } from "@/app/actions";

type PlaylistItem = {
  id: string;
  url: string;
  title: string;
  platform: string;
  providerName: string;
  thumbnailUrl: string | null;
  releaseDate: string | null;
  duration: number | null;
  description: string | null;
  tags: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  createdAt: Date;
  order: number;
};

type PlaylistFolder = {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
  isSystem: boolean;
  items: PlaylistItem[];
};

type User = {
  id: string;
  username: string;
  folders: PlaylistFolder[];
};

type SortMode = 'title' | 'provider' | 'releaseDate' | 'viewCount' | 'likeCount' | 'createdAt' | 'custom';
type SortOrder = 'asc' | 'desc';

const LongPressDeleteButton = ({ onDelete }: { onDelete: () => void }) => {
  const [isPressing, setIsPressing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startPress = (e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return;
    setIsPressing(true);
    timeoutRef.current = setTimeout(() => {
      onDelete();
      setIsPressing(false);
    }, 500);
  };

  const cancelPress = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPressing(false);
  };

  return (
    <button
      className="btn btn-danger-ghost"
      style={{
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      draggable={true}
    >
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: isPressing ? '100%' : '0%',
          background: 'rgba(239, 68, 68, 0.2)',
          transition: isPressing ? 'width 0.5s linear' : 'width 0.2s ease-out',
          zIndex: 0,
        }}
      />
      <span style={{ position: 'relative', zIndex: 1, pointerEvents: 'none' }}>削除</span>
    </button>
  );
};

const WelcomeSplash = ({ username, isNewUser, onComplete }: { username: string, isNewUser: boolean, onComplete: () => void }) => {
  const [stage, setStage] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setStage('show'), 100);
    const t2 = setTimeout(() => setStage('exit'), 2000);
    const t3 = setTimeout(() => onComplete(), 2500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const message = isNewUser ? `ようこそ、${username}さん` : `おかえりなさい、${username}さん`;
  const subMessage = isNewUser ? 'Lyrisphereへ' : '今日も素敵な音楽を';

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      opacity: stage === 'exit' ? 0 : 1,
      transition: 'opacity 0.5s ease-out',
      color: '#111827',
      fontFamily: 'sans-serif',
      pointerEvents: stage === 'exit' ? 'none' : 'auto'
    }}>
      <div style={{
        transform: stage === 'show' ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.98)',
        opacity: stage === 'show' ? 1 : 0,
        filter: stage === 'show' ? 'blur(0px)' : 'blur(8px)',
        transition: 'all 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
        textAlign: 'center'
      }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 400, 
          margin: '0 0 16px 0',
          color: '#111827',
          letterSpacing: stage === 'show' ? '0.05em' : '-0.05em',
          transition: 'letter-spacing 1.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}>
          {message}
        </h1>
        <p style={{
          fontSize: '1.1rem',
          color: '#64748b',
          margin: 0,
          opacity: stage === 'show' ? 1 : 0,
          transform: stage === 'show' ? 'translateY(0)' : 'translateY(10px)',
          letterSpacing: stage === 'show' ? '0.2em' : '0em',
          transition: 'all 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s'
        }}>
          {subMessage}
        </p>
      </div>
    </div>
  );
};

export default function Dashboard({ initialUser }: { initialUser: User }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [showSplash, setShowSplash] = useState(true);
  const isNewUser = useMemo(() => initialUser.folders.every(f => f.items.length === 0), [initialUser]);
  const getTopFolderId = (folders: PlaylistFolder[]) => {
    const nonSystem = folders.filter(f => !f.isSystem);
    if (nonSystem.length > 0) return nonSystem[0].id;
    return folders.length > 0 ? folders[0].id : null;
  };

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    () => getTopFolderId(initialUser.folders)
  );
  
  useEffect(() => {
    setUser(initialUser);
    if (!selectedFolderId && initialUser.folders.length > 0) {
      setSelectedFolderId(getTopFolderId(initialUser.folders));
    } else if (selectedFolderId && !initialUser.folders.find(f => f.id === selectedFolderId)) {
      setSelectedFolderId(getTopFolderId(initialUser.folders));
    }
  }, [initialUser, selectedFolderId]);

  const [newFolderName, setNewFolderName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isOnline, setIsOnline] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Renaming state
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  // Drag and Drop state
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'top' | 'bottom' | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // UI state
  const [toastMessage, setToastMessage] = useState<{message: string, type: 'error' | 'success'} | null>(null);
  const [confirmModal, setConfirmModal] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);
  const [moveModal, setMoveModal] = useState<{itemId: string, itemName: string, currentFolderId: string} | null>(null);
  const [selectedMoveFolderId, setSelectedMoveFolderId] = useState<string>("");

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const lastRefreshTimeRef = useRef<number>(0);
  const [refreshingItemId, setRefreshingItemId] = useState<string | null>(null);

  const handleRefreshItem = async (itemId: string) => {
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 1000) {
      showToast("更新は1秒以上間隔をあけてください", "error");
      return;
    }
    lastRefreshTimeRef.current = now;

    setRefreshingItemId(itemId);
    const res = await refreshPlaylistItem(itemId);
    if (res?.error) {
      showToast(res.error, "error");
    } else {
      showToast("楽曲情報を更新しました", "success");
      refreshData();
    }
    setRefreshingItemId(null);
  };

  // Sorting state
  const [sortMode, setSortMode] = useState<SortMode>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const checkStatus = async () => {
      const online = await checkUserStatus(user.id);
      setIsOnline(online);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const normalizeUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com') && parsed.searchParams.has('v')) {
        return parsed.searchParams.get('v');
      }
      if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.slice(1);
      }
      if (parsed.hostname.includes('nicovideo.jp')) {
        const match = parsed.pathname.match(/watch\/([a-zA-Z0-9_]+)/);
        if (match) return match[1];
      }
      return url;
    } catch {
      return url;
    }
  };

  const formatDate = (dateValue: string | Date | null) => {
    if (!dateValue) return '-';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setIsCreatingFolder(false);
      return;
    }
    if (user.folders.some(f => f.name === name)) {
      showToast(`エラー: フォルダ「${name}」は既に存在します。`);
      return;
    }
    await createFolder(user.id, name);
    setNewFolderName("");
    setIsCreatingFolder(false);
    refreshData();
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreateFolder();
    else if (e.key === 'Escape') {
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    setConfirmModal({
      title: 'フォルダの削除',
      message: `フォルダ「${folderName}」を削除しますか？\nこの操作は元に戻せません。`,
      onConfirm: async () => {
        setConfirmModal(null);
        await deleteFolder(folderId);
        if (selectedFolderId === folderId) setSelectedFolderId(null);
        refreshData();
      }
    });
  };

  const handleRenameFolder = async (folderId: string) => {
    const name = editingFolderName.trim();
    if (!name) {
      setEditingFolderId(null);
      return;
    }
    if (user.folders.some(f => f.id !== folderId && f.name === name)) {
      showToast(`エラー: フォルダ「${name}」は既に存在します。`);
      return;
    }
    await renameFolder(folderId, name);
    setEditingFolderId(null);
    refreshData();
  };

  const executeAddUrl = async (folderId: string, url: string) => {
    setNewUrl("");
    try {
      await addPlaylistItem(folderId, url, user.username);
      showToast("楽曲を追加しました", "success");
      refreshData();
    } catch (e) {
      showToast("エラー: 楽曲の追加に失敗しました。");
      console.error(e);
    }
  };

  const handleAddUrl = async () => {
    const url = newUrl.trim();
    if (!selectedFolderId || !url || !selectedFolder) return;
    
    const normalizedInputUrl = normalizeUrl(url);

    // Check same folder duplicates
    if (selectedFolder.items.some(i => normalizeUrl(i.url) === normalizedInputUrl)) {
      showToast("エラー: この楽曲は現在のフォルダに既に登録されています。");
      return;
    }

    // Check other folders duplicates
    const otherFoldersWithUrl = user.folders.filter(f => 
      f.id !== selectedFolderId && 
      f.items.some(i => normalizeUrl(i.url) === normalizedInputUrl)
    );

    if (otherFoldersWithUrl.length > 0) {
      const folderNames = otherFoldersWithUrl.map(f => `「${f.name}」`).join(", ");
      setConfirmModal({
        title: '楽曲の重複確認',
        message: `この楽曲は既に以下のフォルダに登録されています:\n${folderNames}\n\n続行して現在のフォルダにも追加しますか？`,
        onConfirm: () => {
          setConfirmModal(null);
          executeAddUrl(selectedFolderId, url);
        }
      });
      return;
    }

    await executeAddUrl(selectedFolderId, url);
  };

  const handleDeleteItem = async (itemId: string) => {
    await deletePlaylistItem(itemId);
    refreshData();
  };

  const executeMoveItem = async (itemId: string, targetFolderId: string) => {
    const itemToMove = selectedFolder?.items.find(i => i.id === itemId);
    const targetFolder = user.folders.find(f => f.id === targetFolderId);
    
    if (!itemToMove || !targetFolder) return;

    const normalizedUrl = normalizeUrl(itemToMove.url);
    if (targetFolder.items.some(i => normalizeUrl(i.url) === normalizedUrl)) {
      showToast(`エラー: 移動先のフォルダ「${targetFolder.name}」には既に同じ楽曲が存在します。`);
      return;
    }

    await movePlaylistItem(itemId, targetFolderId);
    refreshData();
  };

  const handleMoveItem = async () => {
    if (!moveModal || !selectedMoveFolderId) return;
    await executeMoveItem(moveModal.itemId, selectedMoveFolderId);
    setMoveModal(null);
    setSelectedMoveFolderId("");
  };

  // Folder Drag & Drop
  const handleFolderDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedFolderId || draggedFolderId === targetId) return;
    const newFolders = [...user.folders];
    const fromIdx = newFolders.findIndex(f => f.id === draggedFolderId);
    const toIdx = newFolders.findIndex(f => f.id === targetId);
    const [removed] = newFolders.splice(fromIdx, 1);
    newFolders.splice(toIdx, 0, removed);
    setUser({ ...user, folders: newFolders });
    await reorderFolders(newFolders.map(f => f.id));
    refreshData();
  };

  const selectedFolder = user.folders.find(f => f.id === selectedFolderId);

  // Apply Sorting
  const displayedItems = useMemo(() => {
    if (!selectedFolder) return [];
    const items = [...selectedFolder.items];
    
    if (sortMode === 'title') {
      items.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    } else if (sortMode === 'provider') {
      items.sort((a, b) => a.providerName.localeCompare(b.providerName, 'ja'));
    } else if (sortMode === 'releaseDate') {
      items.sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateA - dateB;
      });
    } else if (sortMode === 'viewCount') {
      items.sort((a, b) => (a.viewCount || 0) - (b.viewCount || 0));
    } else if (sortMode === 'likeCount') {
      items.sort((a, b) => (a.likeCount || 0) - (b.likeCount || 0));
    } else if (sortMode === 'createdAt') {
      items.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      });
    }

    if (sortOrder === 'desc') {
      items.reverse();
    }
    return items;
  }, [selectedFolder, sortMode, sortOrder]);

  // Item Drag & Drop
  const handleItemDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const pos = dragPosition;
    setDragOverItemId(null);
    setDragPosition(null);

    if (!draggedItemId || draggedItemId === targetId || !selectedFolder) return;
    
    // Automatically switch to Custom Sort if sorted manually
    setSortMode('custom');
    setSortOrder('asc');

    const newItems = [...selectedFolder.items];
    const fromIdx = newItems.findIndex(i => i.id === draggedItemId);
    let toIdx = newItems.findIndex(i => i.id === targetId);

    if (pos === 'bottom') {
      toIdx += 1;
    }
    // Adjust if removing fromIdx shifts the toIdx down
    if (fromIdx < toIdx) {
      toIdx -= 1;
    }

    const [removed] = newItems.splice(fromIdx, 1);
    newItems.splice(toIdx, 0, removed);
    
    // Optimistic UI update
    const newFolders = user.folders.map(f => f.id === selectedFolder.id ? { ...f, items: newItems } : f);
    setUser({ ...user, folders: newFolders });
    
    await reorderItems(newItems.map(i => i.id));
    refreshData();
  };

  return (
    <>
      {showSplash && <WelcomeSplash username={user.username} isNewUser={isNewUser} onComplete={() => setShowSplash(false)} />}
      <div className="layout-container" style={{ display: 'flex', gap: '40px', opacity: showSplash ? 0 : (isPending ? 0.6 : 1), transition: 'opacity 0.5s', minHeight: '80vh' }}>
      
      {/* Sidebar */}
      <aside style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '32px', position: 'sticky', top: '40px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.02em', margin: 0 }}>Lyrisphere</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>{user.username}</p>
          </div>
          <div className={`status-badge ${isOnline ? 'online' : 'offline'}`} title={isOnline ? "VRChat: Online" : "VRChat: Offline"}>
            <div className="status-dot"></div>
            <span>{isOnline ? "参加中" : "オフライン"}</span>
          </div>
        </div>

        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Playlists</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.folders.length}</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {user.folders.filter(f => !f.isSystem).map(folder => (
                <div 
                  key={folder.id} 
                  className={`sidebar-link ${selectedFolderId === folder.id ? 'active' : ''}`}
                  onClick={() => setSelectedFolderId(folder.id)}
                  draggable
                  onDragStart={(e) => { setDraggedFolderId(folder.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { 
                    e.preventDefault(); 
                    e.dataTransfer.dropEffect = 'move'; 
                    if (draggedItemId && dragOverFolderId !== folder.id && selectedFolderId !== folder.id) {
                      setDragOverFolderId(folder.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                  }}
                  onDrop={async (e) => {
                    setDragOverFolderId(null);
                    if (draggedFolderId) {
                      handleFolderDrop(e, folder.id);
                    } else if (draggedItemId && selectedFolderId !== folder.id) {
                      e.preventDefault();
                      await executeMoveItem(draggedItemId, folder.id);
                      setDraggedItemId(null);
                    }
                  }}
                  onDragEnd={() => { setDraggedFolderId(null); setDragOverFolderId(null); }}
                  style={{ 
                    opacity: draggedFolderId === folder.id ? 0.5 : 1, 
                    display: 'flex', 
                    alignItems: 'center',
                    background: dragOverFolderId === folder.id ? '#e0f2fe' : undefined
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexGrow: 1 }}>{folder.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>{folder.items.length}</span>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={folder.isActive} 
                        onChange={(e) => {
                          const isActive = e.target.checked;
                          setUser(prev => ({
                            ...prev,
                            folders: prev.folders.map(f => f.id === folder.id ? { ...f, isActive } : f)
                          }));
                          toggleFolderActive(folder.id, isActive).then(refreshData);
                        }} 
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                </div>
              ))}

              {user.folders.filter(f => f.isSystem).map(folder => (
                <div 
                  key={folder.id} 
                  className={`sidebar-link system-folder ${selectedFolderId === folder.id ? 'active' : ''}`}
                  onClick={() => setSelectedFolderId(folder.id)}
                  onDragOver={(e) => { 
                    e.preventDefault(); 
                    e.dataTransfer.dropEffect = 'move'; 
                    if (draggedItemId && dragOverFolderId !== folder.id && selectedFolderId !== folder.id) {
                      setDragOverFolderId(folder.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                  }}
                  onDrop={async (e) => {
                    setDragOverFolderId(null);
                    if (draggedItemId && selectedFolderId !== folder.id) {
                      e.preventDefault();
                      await executeMoveItem(draggedItemId, folder.id);
                      setDraggedItemId(null);
                    }
                  }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginTop: 'auto',
                    background: dragOverFolderId === folder.id ? '#fce7f3' : undefined
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexGrow: 1, fontWeight: 'bold' }}>{folder.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>{folder.items.length}</span>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={folder.isActive} 
                        onChange={(e) => {
                          const isActive = e.target.checked;
                          setUser(prev => ({
                            ...prev,
                            folders: prev.folders.map(f => f.id === folder.id ? { ...f, isActive } : f)
                          }));
                          toggleFolderActive(folder.id, isActive).then(refreshData);
                        }} 
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                </div>
              ))}
            
            {isCreatingFolder ? (
              <div style={{ padding: '4px 0', marginTop: '4px' }}>
                <input
                  type="text"
                  className="input-text"
                  placeholder="フォルダ名..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={handleCreateKeyDown}
                  onBlur={() => {
                    if (!newFolderName.trim()) setIsCreatingFolder(false);
                  }}
                  autoFocus
                  style={{ padding: '6px 10px' }}
                />
              </div>
            ) : (
              <div 
                className="sidebar-link" 
                style={{ marginTop: '4px', color: 'var(--text-muted)', justifyContent: 'flex-start', gap: '8px' }}
                onClick={() => setIsCreatingFolder(true)}
              >
                <span>＋</span>
                <span>新しいフォルダを作成</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="panel" style={{ flexGrow: 1, padding: '32px', display: 'flex', flexDirection: 'column' }}>
        {!selectedFolder ? (
          <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            左のメニューからフォルダを選択してください
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-light)' }}>
              {editingFolderId === selectedFolder.id ? (
                <div style={{ flexGrow: 1, marginRight: '16px' }}>
                  <input
                    type="text"
                    className="input-text"
                    value={editingFolderName}
                    onChange={(e) => setEditingFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameFolder(selectedFolder.id);
                      if (e.key === 'Escape') setEditingFolderId(null);
                    }}
                    onBlur={() => handleRenameFolder(selectedFolder.id)}
                    autoFocus
                    style={{ fontSize: '1.5rem', fontWeight: 600, padding: '4px 8px' }}
                  />
                </div>
              ) : (
                <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectedFolder.name}
                      {!selectedFolder.isSystem && (
                        <button 
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#d1d5db', display: 'flex', alignItems: 'center', transition: 'color 0.2s', padding: '4px' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#9ca3af'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}
                          onClick={() => {
                            setEditingFolderId(selectedFolder.id);
                            setEditingFolderName(selectedFolder.name);
                          }}
                          title="リネーム"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                          </svg>
                        </button>
                      )}
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>{selectedFolder.items.length}曲のトラック</p>
                  </div>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!selectedFolder.isSystem && (
                  <button className="btn btn-danger-ghost" onClick={() => handleDeleteFolder(selectedFolder.id, selectedFolder.name)}>
                    フォルダ削除
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input
                type="text"
                className="input-text"
                placeholder="YouTube / Niconico のURLを追加"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
              />
              <button className="btn btn-primary" style={{ whiteSpace: "nowrap" }} onClick={handleAddUrl}>
                追加する
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>並び替え</span>
                <div className="segmented-control">
                  <button 
                    className={`segment-btn ${sortMode === 'title' ? 'active' : ''}`}
                    onClick={() => { 
                      if (sortMode === 'title') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortMode('title'); setSortOrder('asc'); }
                    }}
                  >
                    曲名
                    {sortMode === 'title' && (
                      <span style={{ fontSize: '10px', marginLeft: '2px' }}>{sortOrder === 'asc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                  <button 
                    className={`segment-btn ${sortMode === 'provider' ? 'active' : ''}`}
                    onClick={() => { 
                      if (sortMode === 'provider') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortMode('provider'); setSortOrder('asc'); }
                    }}
                  >
                    作曲者
                    {sortMode === 'provider' && (
                      <span style={{ fontSize: '10px', marginLeft: '2px' }}>{sortOrder === 'asc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                  <button 
                    className={`segment-btn ${sortMode === 'releaseDate' ? 'active' : ''}`}
                    onClick={() => { 
                      if (sortMode === 'releaseDate') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortMode('releaseDate'); setSortOrder('desc'); }
                    }}
                  >
                    リリース日
                    {sortMode === 'releaseDate' && (
                      <span style={{ fontSize: '10px', marginLeft: '2px' }}>{sortOrder === 'asc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                  <button 
                    className={`segment-btn ${sortMode === 'viewCount' ? 'active' : ''}`}
                    onClick={() => { 
                      if (sortMode === 'viewCount') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortMode('viewCount'); setSortOrder('desc'); }
                    }}
                  >
                    視聴数
                    {sortMode === 'viewCount' && (
                      <span style={{ fontSize: '10px', marginLeft: '2px' }}>{sortOrder === 'asc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                  <button 
                    className={`segment-btn ${sortMode === 'likeCount' ? 'active' : ''}`}
                    onClick={() => { 
                      if (sortMode === 'likeCount') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortMode('likeCount'); setSortOrder('desc'); }
                    }}
                  >
                    高評価
                    {sortMode === 'likeCount' && (
                      <span style={{ fontSize: '10px', marginLeft: '2px' }}>{sortOrder === 'asc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                  <button 
                    className={`segment-btn ${sortMode === 'createdAt' ? 'active' : ''}`}
                    onClick={() => { 
                      if (sortMode === 'createdAt') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortMode('createdAt'); setSortOrder('desc'); }
                    }}
                  >
                    追加日
                    {sortMode === 'createdAt' && (
                      <span style={{ fontSize: '10px', marginLeft: '2px' }}>{sortOrder === 'asc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                  <button 
                    className={`segment-btn ${sortMode === 'custom' ? 'active' : ''}`}
                    onClick={() => { setSortMode('custom'); setSortOrder('asc'); }}
                  >
                    手動
                  </button>
                </div>
              </div>
            </div>

            {displayedItems.length === 0 ? (
              <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: '200px' }}>
                <p style={{ color: "var(--text-muted)" }}>楽曲がありません。上の入力欄からURLを追加してください。</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {displayedItems.map((item) => (
                  <div key={item.id} style={{ position: 'relative' }}>
                    {dragOverItemId === item.id && dragPosition === 'top' && (
                      <div style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 4, background: '#3b82f6', borderRadius: 2, zIndex: 10, pointerEvents: 'none' }} />
                    )}
                    
                    <div 
                      className="list-item"
                      draggable={true}
                      onDragStart={(e) => { 
                        setDraggedItemId(item.id); 
                        e.dataTransfer.effectAllowed = 'move'; 
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (sortMode !== 'custom' || draggedItemId === item.id) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const newPos = y < rect.height / 2 ? 'top' : 'bottom';
                        if (dragPosition !== newPos) setDragPosition(newPos);
                        if (dragOverItemId !== item.id) setDragOverItemId(item.id);
                      }}
                      onDragLeave={(e) => {
                        // Only clear if leaving the item entirely
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverItemId(null);
                          setDragPosition(null);
                        }
                      }}
                      onDrop={(e) => handleItemDrop(e, item.id)}
                      onDragEnd={() => {
                        setDraggedItemId(null);
                        setDragOverItemId(null);
                        setDragPosition(null);
                      }}
                      style={{ 
                        opacity: draggedItemId === item.id ? 0.4 : 1,
                        cursor: sortMode === 'custom' ? 'grab' : 'default',
                        transition: 'opacity 0.2s',
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", overflow: "hidden", flexGrow: 1, pointerEvents: draggedItemId ? 'none' : 'auto' }}>
                        {sortMode === 'custom' && (
                          <div style={{ color: "var(--border-light)", fontSize: "1.2rem", cursor: "grab", paddingRight: "8px" }}>⋮⋮</div>
                        )}
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }} draggable={false}>
                            {item.thumbnailUrl ? (
                              <img src={item.thumbnailUrl} alt="thumbnail" draggable={false} style={{ width: "96px", height: "54px", objectFit: "cover", borderRadius: "6px", border: '1px solid var(--border-light)' }} />
                            ) : (
                              <div style={{ width: "96px", height: "54px", background: "#f3f4f6", borderRadius: "6px", border: '1px solid var(--border-light)' }}></div>
                            )}
                            {item.duration !== null && (
                              <span style={{ position: "absolute", bottom: "4px", right: "4px", background: "rgba(0,0,0,0.75)", color: "white", fontSize: "10px", padding: "2px 4px", borderRadius: "4px", fontWeight: "bold" }}>
                                {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                              </span>
                            )}
                          </a>
                        </div>
                        <div style={{ overflow: "hidden", flexGrow: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 0 4px 0" }}>
                            {item.platform === 'youtube' ? (
                              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#ff0000", flexShrink: 0, fontSize: "1.1rem" }}>
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                              </svg>
                            ) : item.platform === 'niconico' ? (
                              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#ffffff", background: "#000000", borderRadius: "2px", flexShrink: 0, fontSize: "1.1rem" }}>
                                <path d="M2.38 12C2.38 6.69 6.69 2.38 12 2.38S21.62 6.69 21.62 12 17.31 21.62 12 21.62 2.38 17.31 2.38 12zm8.57-2.3c0-.44-.35-.79-.79-.79h-2.1c-.44 0-.79.35-.79.79v4.6c0 .44.35.79.79.79h2.1c.44 0 .79-.35.79-.79v-4.6zm6.65.68c0-1.78-1.44-3.22-3.22-3.22h-1.6c-.44 0-.79.35-.79.79v4.6c0 .44.35.79.79.79h1.6c1.78 0 3.22-1.44 3.22-3.22zM15 11.23h-.42v1.54H15c.42 0 .76-.34.76-.77 0-.42-.34-.77-.76-.77z"/>
                              </svg>
                            ) : (
                              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, fontSize: "1.1rem" }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            )}
                            <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }} draggable={false}>
                              <p style={{ fontSize: "1rem", fontWeight: "500", margin: 0, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
                            </a>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigator.clipboard.writeText(item.url);
                                showToast("URLをコピーしました", "success");
                              }}
                              style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                color: "var(--text-muted)", display: "flex", alignItems: "center",
                                padding: "4px", flexShrink: 0, fontSize: "1rem", transition: "color 0.2s"
                              }}
                              title="URLをコピー"
                              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                              <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                          </div>
                          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{item.providerName}</span>
                            {item.viewCount !== null && (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                {new Intl.NumberFormat('ja-JP', { notation: "compact", compactDisplay: "short" }).format(item.viewCount)}
                              </span>
                            )}
                            {item.likeCount !== null && (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                                {new Intl.NumberFormat('ja-JP', { notation: "compact", compactDisplay: "short" }).format(item.likeCount)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "4px" }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              リリース: {formatDate(item.releaseDate)}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              追加日: {formatDate(item.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginLeft: "16px", flexShrink: 0 }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleRefreshItem(item.id)}
                          disabled={refreshingItemId === item.id}
                          style={{ padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="楽曲情報を更新・正規化"
                        >
                          <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ animation: refreshingItemId === item.id ? 'spin 1s linear infinite' : 'none' }}
                          >
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                          </svg>
                        </button>
                        <LongPressDeleteButton onDelete={() => handleDeleteItem(item.id)} />
                      </div>
                    </div>
                    {dragOverItemId === item.id && dragPosition === 'bottom' && (
                      <div style={{ position: 'absolute', bottom: -2, left: 0, right: 0, height: 4, background: '#3b82f6', borderRadius: 2, zIndex: 10, pointerEvents: 'none' }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Custom Toast Notification */}
      {toastMessage && (
        <div className={`toast-container ${toastMessage.type}`}>
          {toastMessage.message}
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>{confirmModal.title}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>キャンセル</button>
              <button className="btn btn-primary" onClick={confirmModal.onConfirm}>確認して続行</button>
            </div>
          </div>
        </div>
      )}

      {/* Move Item Modal */}
      {moveModal && (
        <div className="modal-overlay" onClick={() => { setMoveModal(null); setSelectedMoveFolderId(""); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>楽曲の移動</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
              「{moveModal.itemName}」を移動するフォルダを選択してください。
            </p>
            <select
              className="input-text"
              value={selectedMoveFolderId}
              onChange={(e) => setSelectedMoveFolderId(e.target.value)}
              style={{ marginBottom: '24px' }}
            >
              {user.folders.filter(f => f.id !== moveModal.currentFolderId).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => { setMoveModal(null); setSelectedMoveFolderId(""); }}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleMoveItem} disabled={!selectedMoveFolderId}>移動する</button>
            </div>
          </div>
        </div>
      )}

      </div>
    </>
  );
}
