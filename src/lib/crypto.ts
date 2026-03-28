import crypto from "node:crypto";
import * as argon2 from "argon2";
import { ValidationError } from "./errors.js";

const API_KEY_PREFIX = "es_";
const KEY_LENGTH = 32;

export function generateApiKey(): string {
  const random = crypto.randomBytes(KEY_LENGTH).toString("base64url");
  return `${API_KEY_PREFIX}${random}`;
}

export function getKeyPrefix(key: string): string {
  return key.substring(0, 8);
}

export async function hashApiKey(key: string): Promise<string> {
  return argon2.hash(key);
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, key);
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

export function signWebhookPayload(
  secret: string,
  webhookId: string,
  timestamp: number,
  body: string,
): string {
  const toSign = `${webhookId}.${timestamp}.${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(toSign)
    .digest("base64");
  return `v1,${signature}`;
}

export function generateDkimKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function extractDkimPublicKeyBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s/g, "");
}

export function encryptPrivateKey(privateKey: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(encryptionKey, "hex");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(privateKey, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decryptPrivateKey(encrypted: string, encryptionKey: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new ValidationError("Invalid encrypted data format");
  }
  const [ivB64, authTagB64, data] = parts;
  const iv = Buffer.from(ivB64, "base64");
  if (iv.length !== 16) {
    throw new ValidationError("Invalid encrypted data: bad IV length");
  }
  const authTag = Buffer.from(authTagB64, "base64");
  if (authTag.length !== 16) {
    throw new ValidationError("Invalid encrypted data: bad auth tag length");
  }
  const key = Buffer.from(encryptionKey, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
