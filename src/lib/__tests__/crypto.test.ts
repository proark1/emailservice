import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  getKeyPrefix,
  encryptPrivateKey,
  decryptPrivateKey,
  signWebhookPayload,
  generateWebhookSecret,
  generateDkimKeyPair,
  extractDkimPublicKeyBase64,
} from "../crypto.js";

const TEST_ENCRYPTION_KEY = "a".repeat(64);

describe("generateApiKey", () => {
  it("returns a key starting with es_ prefix", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^es_/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });
});

describe("getKeyPrefix", () => {
  it("returns first 8 characters", () => {
    expect(getKeyPrefix("es_abcdefghijklmnop")).toBe("es_abcde");
  });
});

describe("encryptPrivateKey / decryptPrivateKey", () => {
  it("round-trips correctly", () => {
    const plaintext = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg...\n-----END PRIVATE KEY-----";
    const encrypted = encryptPrivateKey(plaintext, TEST_ENCRYPTION_KEY);
    const decrypted = decryptPrivateKey(encrypted, TEST_ENCRYPTION_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "test data";
    const a = encryptPrivateKey(plaintext, TEST_ENCRYPTION_KEY);
    const b = encryptPrivateKey(plaintext, TEST_ENCRYPTION_KEY);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptPrivateKey("secret", TEST_ENCRYPTION_KEY);
    const parts = encrypted.split(":");
    parts[2] = "AAAA" + parts[2].slice(4); // tamper with data
    expect(() => decryptPrivateKey(parts.join(":"), TEST_ENCRYPTION_KEY)).toThrow();
  });

  it("throws on wrong key", () => {
    const encrypted = encryptPrivateKey("secret", TEST_ENCRYPTION_KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decryptPrivateKey(encrypted, wrongKey)).toThrow();
  });

  it("throws on invalid format", () => {
    expect(() => decryptPrivateKey("not:valid", TEST_ENCRYPTION_KEY)).toThrow("Invalid encrypted data format");
  });
});

describe("signWebhookPayload", () => {
  it("returns a v1 prefixed HMAC signature", () => {
    const sig = signWebhookPayload("secret", "wh_123", 1700000000, '{"test":true}');
    expect(sig).toMatch(/^v1,.+$/);
  });

  it("is deterministic for same inputs", () => {
    const args = ["secret", "wh_123", 1700000000, '{"test":true}'] as const;
    expect(signWebhookPayload(...args)).toBe(signWebhookPayload(...args));
  });

  it("differs for different bodies", () => {
    const a = signWebhookPayload("secret", "wh_123", 1700000000, '{"a":1}');
    const b = signWebhookPayload("secret", "wh_123", 1700000000, '{"b":2}');
    expect(a).not.toBe(b);
  });
});

describe("generateWebhookSecret", () => {
  it("returns a whsec_ prefixed secret", () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_/);
  });
});

describe("generateDkimKeyPair", () => {
  it("returns PEM-encoded RSA key pair", () => {
    const { publicKey, privateKey } = generateDkimKeyPair();
    expect(publicKey).toContain("BEGIN PUBLIC KEY");
    expect(privateKey).toContain("BEGIN PRIVATE KEY");
  });
});

describe("extractDkimPublicKeyBase64", () => {
  it("strips PEM headers and whitespace", () => {
    const pem = "-----BEGIN PUBLIC KEY-----\nABCD\nEFGH\n-----END PUBLIC KEY-----\n";
    expect(extractDkimPublicKeyBase64(pem)).toBe("ABCDEFGH");
  });
});
