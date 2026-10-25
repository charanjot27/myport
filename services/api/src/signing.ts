import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

/**
 * Ed25519 signing for liveness attestations. The payload is canonical JSON
 * signed as UTF-8 bytes; anyone can verify it with the public JWK served at
 * /liveness/keys, without trusting JOTR's servers at verification time.
 */
export class AttestationSigner {
  private readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;

  constructor(
    pem: string | undefined,
    readonly keyId: string,
  ) {
    if (pem) {
      this.privateKey = createPrivateKey(pem.replace(/\\n/g, "\n"));
    } else {
      this.privateKey = generateKeyPairSync("ed25519").privateKey;
    }
    this.publicKey = createPublicKey(this.privateKey);
  }

  sign(payload: Record<string, unknown>): { payload: string; signature: string; keyId: string } {
    const body = canonicalJson(payload);
    const signature = sign(null, Buffer.from(body, "utf8"), this.privateKey).toString("base64url");
    return { payload: body, signature, keyId: this.keyId };
  }

  verify(payload: string, signature: string): boolean {
    try {
      return verify(null, Buffer.from(payload, "utf8"), this.publicKey, Buffer.from(signature, "base64url"));
    } catch {
      return false;
    }
  }

  jwk(): Record<string, unknown> {
    return { ...this.publicKey.export({ format: "jwk" }), kid: this.keyId, alg: "EdDSA", use: "sig" };
  }
}

/** JSON with sorted keys so the same data always produces the same bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
