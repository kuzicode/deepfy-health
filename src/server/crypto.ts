import crypto from "node:crypto";

// AES-256-GCM 信封加密：每个账号一把 DEK，DEK 由主密钥 KEK（KZ_MASTER_KEY）包裹后入库。
// AAD 把密文绑定到所属对象，防止密文被挪到别的用户或别的记录下仍能解开。

const VERSION = "v1";
const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function parseKey(base64: string | undefined, name = "KZ_MASTER_KEY"): Buffer {
  if (!base64) throw new Error(`${name} 未设置`);
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error(`${name} 必须是 32 字节的 base64（openssl rand -base64 32）`);
  return key;
}

export const masterKey = () => parseKey(process.env.KZ_MASTER_KEY);

export function seal(key: Buffer, plaintext: Buffer | string, aad: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [VERSION, b64(nonce), b64(ct), b64(cipher.getAuthTag())].join(":");
}

export function open(key: Buffer, sealed: string, aad: string): Buffer {
  const [version, nonce, ct, tag] = sealed.split(":");
  if (version !== VERSION || !nonce || ct === undefined || !tag) throw new Error("密文格式不正确");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, unb64(nonce), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(unb64(tag));
  return Buffer.concat([decipher.update(unb64(ct)), decipher.final()]);
}

export const newDek = () => crypto.randomBytes(32);
export const wrapDek = (kek: Buffer, dek: Buffer, userId: string) => seal(kek, dek, `dek:${userId}`);
export const unwrapDek = (kek: Buffer, wrapped: string, userId: string) => open(kek, wrapped, `dek:${userId}`);

export const sha256 = (data: Buffer | string) => crypto.createHash("sha256").update(data).digest("hex");
export const randomId = () => crypto.randomUUID();
