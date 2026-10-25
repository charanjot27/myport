import { generateKeyPairSync } from "node:crypto";

// Prints a new Ed25519 key for LIVENESS_PRIVATE_KEY (store it in your secret manager).
const { privateKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
console.log(`LIVENESS_PRIVATE_KEY="${pem.trim().replace(/\n/g, "\\n")}"`);
console.log(`LIVENESS_KEY_ID="${new Date().toISOString().slice(0, 10)}"`);
