import { describe, expect, it } from "vitest";
import { newDek, open, parseKey, seal, unwrapDek, wrapDek } from "./crypto";

describe("crypto", () => {
  const key = newDek();

  it("加密后可还原，且每次密文不同", () => {
    const a = seal(key, "血红蛋白 152", "doc:m1:record:x");
    expect(a).not.toContain("血红蛋白");
    expect(seal(key, "血红蛋白 152", "doc:m1:record:x")).not.toBe(a);
    expect(open(key, a, "doc:m1:record:x").toString()).toBe("血红蛋白 152");
  });

  it("篡改密文、换 AAD、换密钥都无法解密", () => {
    const sealed = seal(key, "secret", "aad-1");
    const [v, n, ct, tag] = sealed.split(":");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => open(key, [v, n, flipped.toString("base64url"), tag].join(":"), "aad-1")).toThrow();
    expect(() => open(key, sealed, "aad-2")).toThrow();
    expect(() => open(newDek(), sealed, "aad-1")).toThrow();
  });

  it("DEK 包裹绑定用户", () => {
    const kek = newDek();
    const dek = newDek();
    const wrapped = wrapDek(kek, dek, "u1");
    expect(unwrapDek(kek, wrapped, "u1").equals(dek)).toBe(true);
    expect(() => unwrapDek(kek, wrapped, "u2")).toThrow();
  });

  it("主密钥长度校验", () => {
    expect(() => parseKey(undefined)).toThrow("未设置");
    expect(() => parseKey(Buffer.alloc(16).toString("base64"))).toThrow("32 字节");
    expect(parseKey(Buffer.alloc(32).toString("base64"))).toHaveLength(32);
  });
});
