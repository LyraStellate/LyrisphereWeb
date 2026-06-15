export const SECRET_KEY = process.env.SECRET_KEY || "LyrisphereSecret2026";

function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

export function decodeUdonId(encodedId: string): string | null {
  try {
    // Check if it's a UUID (reissued ID)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(encodedId)) {
      // UUIDs are not decoded, they are used as is, but we distinguish them later in DB
      return encodedId; // This might be handled differently
    }

    // Replace Base64Url specific chars back to standard Base64
    let base64 = encodedId.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if necessary
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const keyBytes = new TextEncoder().encode(SECRET_KEY);
    const decryptedBytes = xorBytes(bytes, keyBytes);

    const username = new TextDecoder().decode(decryptedBytes);
    return username;
  } catch (error) {
    console.error("Failed to decode ID:", error);
    return null;
  }
}

export function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
