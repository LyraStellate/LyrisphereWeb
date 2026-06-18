import { SECRET_KEY, decodeUdonId } from "./src/lib/crypto";

// C# Equivalent Mock
function encodeUdonId(username: string): string {
    const plaintext = "udon|" + username;
    const plainBytes = new TextEncoder().encode(plaintext);
    const keyBytes = new TextEncoder().encode(SECRET_KEY);
    
    // 1. Salt
    const salt = Math.floor(Math.random() * 65536);
    
    const outBytes = new Uint8Array(plainBytes.length + 2);
    outBytes[0] = (salt >> 8) & 0xFF;
    outBytes[1] = salt & 0xFF;
    
    let seed = salt >>> 0;
    
    for (let i = 0; i < plainBytes.length; i++) {
        seed = (Math.imul(seed, 214013) + 2531011) >>> 0;
        const randomByte = (seed >>> 16) & 0xFF;
        outBytes[i + 2] = plainBytes[i] ^ keyBytes[i % keyBytes.length] ^ randomByte;
    }
    
    const base64 = btoa(String.fromCharCode(...outBytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

console.log("Testing crypto...");
const username = "TestUser123";

const id1 = encodeUdonId(username);
const id2 = encodeUdonId(username);

console.log("ID1:", id1);
console.log("ID2:", id2);

if (id1 === id2) {
    console.error("FAIL: Same username produced same ID.");
    process.exit(1);
}

const decoded1 = decodeUdonId(id1);
const decoded2 = decodeUdonId(id2);

console.log("Decoded 1:", decoded1);
console.log("Decoded 2:", decoded2);

if (decoded1 !== username || decoded2 !== username) {
    console.error("FAIL: Decoded username does not match.");
    process.exit(1);
}

// Test without udon tag
function encodeBadId(username: string): string {
    const plainBytes = new TextEncoder().encode(username);
    const keyBytes = new TextEncoder().encode(SECRET_KEY);
    const salt = 12345;
    const outBytes = new Uint8Array(plainBytes.length + 2);
    outBytes[0] = (salt >> 8) & 0xFF;
    outBytes[1] = salt & 0xFF;
    let seed = salt >>> 0;
    for (let i = 0; i < plainBytes.length; i++) {
        seed = (Math.imul(seed, 214013) + 2531011) >>> 0;
        const randomByte = (seed >>> 16) & 0xFF;
        outBytes[i + 2] = plainBytes[i] ^ keyBytes[i % keyBytes.length] ^ randomByte;
    }
    const base64 = btoa(String.fromCharCode(...outBytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const badId = encodeBadId("Player1");
const decodedBad = decodeUdonId(badId);
console.log("Decoded Bad (no tag):", decodedBad);

if (decodedBad !== null) {
    console.error("FAIL: Decoded untagged ID should return null.");
    process.exit(1);
}

console.log("SUCCESS: All tests passed!");
