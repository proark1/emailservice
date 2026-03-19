import { generateDkimKeyPair, extractDkimPublicKeyBase64, encryptPrivateKey, decryptPrivateKey } from "../lib/crypto.js";
import { getConfig } from "../config/index.js";

const DEFAULT_SELECTOR = "es1";

export interface DkimKeys {
  selector: string;
  publicKey: string;
  privateKey: string;
  dnsValue: string;
}

export function generateDkimForDomain(): DkimKeys {
  const { publicKey, privateKey } = generateDkimKeyPair();
  const publicKeyBase64 = extractDkimPublicKeyBase64(publicKey);
  const dnsValue = `v=DKIM1; k=rsa; p=${publicKeyBase64}`;

  const config = getConfig();
  const encryptedPrivateKey = encryptPrivateKey(privateKey, config.ENCRYPTION_KEY);

  return {
    selector: DEFAULT_SELECTOR,
    publicKey,
    privateKey: encryptedPrivateKey,
    dnsValue,
  };
}

export function getDkimPrivateKey(encryptedKey: string): string {
  const config = getConfig();
  return decryptPrivateKey(encryptedKey, config.ENCRYPTION_KEY);
}
