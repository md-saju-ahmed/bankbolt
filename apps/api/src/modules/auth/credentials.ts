import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const saltBytes = 16;
const hashBytes = 32;
const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 ** 2 };

function derive(value: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(value, salt, hashBytes, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashCredential(value: string) {
  const salt = randomBytes(saltBytes);
  const hash = await derive(value, salt);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyCredential(
  value: string,
  stored: string | null | undefined,
) {
  const parts = /^scrypt:([0-9a-f]{32}):([0-9a-f]{64})$/.exec(stored ?? "");
  const salt = parts ? Buffer.from(parts[1], "hex") : Buffer.alloc(saltBytes);
  const actual = await derive(value, salt);
  const expected = parts
    ? Buffer.from(parts[2], "hex")
    : Buffer.alloc(hashBytes);
  return timingSafeEqual(actual, expected) && Boolean(parts);
}
