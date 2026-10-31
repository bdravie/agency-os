// Encrypts the Google refresh tokens before they are saved, so a copy of the database alone can never send mail.
// The key is derived from SESSION_SECRET; if that secret is ever changed the mailboxes must be connected again.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const key = (secret: string): Buffer => {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return Buffer.from(hkdfSync("sha256", secret, "agency-os", "mailbox-tokens", 32));
};

/** Returns "v1.<iv>.<tag>.<ciphertext>", each part base64url. */
export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptToken(blob: string, secret: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unreadable saved token. Connect the mailbox again.");
  try {
    const d = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new Error("The saved token could not be decrypted (the secret changed?). Connect the mailbox again.");
  }
}
