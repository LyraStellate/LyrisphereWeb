export const SECRET_KEY = process.env.SECRET_KEY || "LyrisphereSecret2026";

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
