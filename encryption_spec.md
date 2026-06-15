# 暗号化・ID生成仕様書 (Udon向け)

本ドキュメントは、Udon側で「VRCUrl InputField」用に入力させる専用URL文字列（ログインID）の生成ロジックについて定めたものです。

## 概要

Udonの制約（強力な暗号化ライブラリが標準で利用不可）を考慮し、**「XOR難読化 ＋ Base64Urlエンコード」** を用いてIDを生成します。

## アルゴリズム

Udon側で取得した `VRCPlayerApi.displayName` を元に、以下の手順でID文字列を生成してください。

### 1. XOR難読化
ユーザー名の文字列（UTF-8バイト配列）と、事前に取り決めた共有鍵（Secret Key）の文字列（UTF-8バイト配列）の各バイトについて、XOR（排他的論理和）演算を行います。

*   **共有鍵 (Secret Key):** `LyrisphereSecret2026` （※仮設定。実装時に任意のものに変更可能ですが、サーバー側と一致させる必要があります）
*   **処理:** ユーザー名の長さが共有鍵より長い場合は、共有鍵をループして適用します。

### 2. Base64Urlエンコード
XOR演算結果のバイト配列を Base64 文字列に変換し、さらに URL セーフな形式（Base64Url形式）に置換します。

*   `+` を `-` に置換
*   `/` を `_` に置換
*   末尾の `=` （パディング）を削除

### 3. URLの構築
生成された文字列を `id` パラメータとして付与したURLを作成します。

*   **最終出力例:** `https://lyrisphere.lyrastellate.dev/api/login?id={生成されたID文字列}`

---

## 【参考】 C# (UdonSharp) 相当の疑似コード

```csharp
string username = VRCPlayerApi.GetPlayerById(playerId).displayName;
string secretKey = "LyrisphereSecret2026";

byte[] userBytes = System.Text.Encoding.UTF8.GetBytes(username);
byte[] keyBytes = System.Text.Encoding.UTF8.GetBytes(secretKey);
byte[] xorBytes = new byte[userBytes.Length];

// 1. XOR処理
for (int i = 0; i < userBytes.Length; i++)
{
    xorBytes[i] = (byte)(userBytes[i] ^ keyBytes[i % keyBytes.Length]);
}

// 2. Base64Url化
string base64Str = System.Convert.ToBase64String(xorBytes);
string idString = base64Str.Replace('+', '-').Replace('/', '_').TrimEnd('=');

// 3. URL作成
string finalUrl = "https://lyrisphere.lyrastellate.dev/api/login?id=" + idString;
```

---

## サーバー側の挙動（URL再発行について）
*   基本的には、上記ロジックで生成されたURLをWebブラウザで開くことで、サーバー側で逆算（Base64デコード＆XOR）し、ユーザーを特定します。
*   ユーザーがWebページ上で「URLの再発行（無効化）」を行った場合、サーバーはランダムなUUIDを新規発行します。
*   再発行が行われたユーザーについては、**Udon側で生成した上記のIDは使用できなくなります**。再発行後は、Web画面に表示された新しいUUIDをVRChat内で直接コピペ入力する必要があります。（この旨はWeb上でユーザーに案内されます）
