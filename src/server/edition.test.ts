import { afterEach, describe, expect, it, vi } from "vitest";
import { edition, isHosted, isSelfHosted } from "./edition";

afterEach(() => vi.unstubAllEnvs());

describe("edition", () => {
  it("defaults to hosted", () => {
    vi.stubEnv("KZ_EDITION", "");
    expect(edition()).toBe("hosted");
    expect(isHosted()).toBe(true);
  });

  it("reads self", () => {
    vi.stubEnv("KZ_EDITION", " self ");
    expect(isSelfHosted()).toBe(true);
    expect(isHosted()).toBe(false);
  });

  it("rejects unknown values", () => {
    vi.stubEnv("KZ_EDITION", "selfhost");
    expect(() => edition()).toThrow(/KZ_EDITION/);
  });
});
