# 暗号化・ID生成仕様書 (Udon向け)

本ドキュメントは、Udon側で「VRCUrl InputField」用に入力させる専用URL文字列（ログインID）の生成ロジックについて定めたものです。

## 概要

Udonの制約（強力な暗号化ライブラリが標準で利用不可）を考慮し、**「ランダムソルト付きのLCGストリーム暗号 ＋ Base64Urlエンコード」** を用いてIDを生成します。
これにより、同じユーザー名であっても生成するたびに異なる文字列が出力され、対応表推測による攻撃を防ぎます。
また、外部アクセスとUdonからのアクセスを区別するため、平文には `udon|` タグを付与します。

## アルゴリズム

Udon側で取得した `VRCPlayerApi.displayName` を元に、以下の手順でID文字列を生成してください。

### 1. 平文の構築
取得したユーザー名の先頭に `udon|` を付与し、UTF-8バイト配列に変換します。
（例: ユーザー名が `PlayerA` の場合、平文は `udon|PlayerA` となります）

### 2. 暗号化（ランダムソルト付きLCGストリーム暗号）
1. **ソルト生成**: 0～65535 の範囲で2バイトのランダムな整数（ソルト）を生成します。
2. **シード初期化**: 生成したソルトを初期シード（32ビット符号なし整数）として設定します。
3. **ストリーム生成とXOR**:
   平文の各バイトに対して、以下の演算を行います：
   - シードをLCGアルゴリズムで更新: `seed = (seed * 214013 + 2531011)`
   - 擬似乱数バイトを取得: `randomByte = (seed >> 16) & 0xFF`
   - 暗号化バイトを計算: `CipherByte = PlaintextByte ^ SecretKeyByte ^ randomByte`
     ※ `SecretKeyByte` は、共有鍵（`LyrisphereSecret2026`）のUTF-8バイト配列をループして使用します。

### 3. 出力データの構築とエンコード
1. **データ結合**: 先頭の2バイトに「生成したソルト」を格納し、3バイト目以降に「暗号化バイト配列」を格納した配列を作成します。
2. **Base64Url化**: 結合した配列を Base64 文字列に変換し、URLセーフな形式に置換します。
   - `+` を `-` に置換
   - `/` を `_` に置換
   - 末尾の `=` （パディング）を削除

### 4. URLの構築
生成された文字列を `id` パラメータとして付与したURLを作成します。
* **最終出力例:** `https://lyrisphere.lyrastellate.dev/api/login?id={生成されたID文字列}`

---

## 【参考】 C# (UdonSharp) 相当の疑似コード

```csharp
string username = VRCPlayerApi.GetPlayerById(playerId).displayName;
string secretKey = "LyrisphereSecret2026";
string plaintext = "udon|" + username;

byte[] plainBytes = System.Text.Encoding.UTF8.GetBytes(plaintext);
byte[] keyBytes = System.Text.Encoding.UTF8.GetBytes(secretKey);

// 1. ソルトの生成 (0〜65535)
int salt = UnityEngine.Random.Range(0, 65536);

// 2. 出力配列の準備 (ソルト2バイト + 暗号文長)
byte[] outBytes = new byte[plainBytes.Length + 2];
outBytes[0] = (byte)(salt >> 8);
outBytes[1] = (byte)(salt & 0xFF);

// 3. LCGストリーム暗号による暗号化
uint seed = (uint)salt;

for (int i = 0; i < plainBytes.Length; i++) {
    // LCG更新
    seed = (seed * 214013 + 2531011);
    byte randomByte = (byte)((seed >> 16) & 0xFF);
    
    // XOR演算 (平文 ^ 鍵 ^ 乱数)
    outBytes[i + 2] = (byte)(plainBytes[i] ^ keyBytes[i % keyBytes.Length] ^ randomByte);
}

// 4. Base64Urlエンコード
string base64 = System.Convert.ToBase64String(outBytes);
string id = base64.Replace("+", "-").Replace("/", "_").TrimEnd('=');

// 最終URL生成
// url = "https://lyrisphere.lyrastellate.dev/api/login?id=" + id;
```
