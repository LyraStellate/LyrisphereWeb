export const SECRET_KEY = (typeof process !== 'undefined' ? process.env.SECRET_KEY : undefined) || "LyrisphereSecret2026";

export function decodeUdonId(encodedId: string): string | null {
  try {
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

    if (bytes.length < 2) return null;

    // Extract the 2-byte salt
    const salt = (bytes[0] << 8) | bytes[1];
    let seed = salt >>> 0;

    const keyBytes = new TextEncoder().encode(SECRET_KEY);
    const decryptedBytes = new Uint8Array(bytes.length - 2);

    for (let i = 0; i < decryptedBytes.length; i++) {
      // LCG step: seed = (seed * 214013 + 2531011) % 2^32
      seed = (Math.imul(seed, 214013) + 2531011) >>> 0;
      const randomByte = (seed >>> 16) & 0xFF;
      decryptedBytes[i] = bytes[i + 2] ^ keyBytes[i % keyBytes.length] ^ randomByte;
    }

    const plaintext = new TextDecoder().decode(decryptedBytes);
    
    // Verify tag
    if (plaintext.startsWith("udon|")) {
      return plaintext.substring(5);
    }
    
    return null;
  } catch (error) {
    console.error("Failed to decode ID:", error);
    return null;
  }
}

export function encodeLocalUserId(platform: 'vrchat' | 'web', username: string): string {
  const str = `${platform}|${username}`;
  let base64 = "";
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(str, 'utf-8').toString('base64');
  } else {
    // Browser fallback
    base64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode(Number('0x' + p1));
    }));
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLocalUserId(encodedId: string): { platform: string, username: string } | null {
  try {
    let str = '';
    let base64 = encodedId.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';

    if (typeof Buffer !== 'undefined') {
      str = Buffer.from(base64, 'base64').toString('utf-8');
    } else {
      str = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    }

    const parts = str.split('|');
    if (parts.length >= 2) {
      return {
        platform: parts[0],
        username: parts.slice(1).join('|')
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}
