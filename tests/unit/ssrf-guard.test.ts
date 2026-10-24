import { describe, it, expect } from "vitest";
import { isPrivateOrReservedIp, assertSafeUrl } from "@/lib/research/ssrf-guard";

describe("isPrivateOrReservedIp", () => {
  it("blocks loopback addresses", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
  });

  it("blocks private IPv4 ranges", () => {
    expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.5")).toBe(true);
  });

  it("blocks the cloud metadata service address", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });

  it("blocks IPv6 link-local and unique-local ranges", () => {
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd00::1")).toBe(true);
  });

  it("allows ordinary public IPv4 addresses", () => {
    expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false); // example.com
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
  });

  it("unwraps IPv4-mapped IPv6 addresses before checking", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it("accepts http/https URLs", () => {
    expect(() => assertSafeUrl("https://example.com")).not.toThrow();
    expect(() => assertSafeUrl("http://example.com")).not.toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow();
    expect(() => assertSafeUrl("ftp://example.com")).toThrow();
  });
});
