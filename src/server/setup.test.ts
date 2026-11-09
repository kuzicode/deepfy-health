import { describe, expect, it } from "vitest";
import { isLocalHost } from "./setup";

describe("isLocalHost", () => {
  it("本机和局域网地址可以完成首次设置", () => {
    for (const h of ["localhost:3100", "localhost", "app.localhost", "127.0.0.1:3100", "192.168.1.10:3100", "[::1]:3100", "[fe80::1]", "nas.local", "health.lan:3100", "box.home.arpa"]) {
      expect(isLocalHost(h), h).toBe(true);
    }
  });

  it("公网域名不行（防 DNS rebinding），空值也不行", () => {
    for (const h of ["evil.example.com", "evil.example.com:3100", "localhost.evil.com", "lan.evil.com", "", null, undefined]) {
      expect(isLocalHost(h), String(h)).toBe(false);
    }
  });
});
