import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { isPrivateIPv4, isVirtualInterface, listLanCandidates, pickPrimary } from "@/server/utils/lan";

const v4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: "255.255.255.0",
  family: "IPv4",
  mac: "00:00:00:00:00:00",
  internal,
  cidr: `${address}/24`,
});

describe("LAN IP detection", () => {
  it("classifies RFC1918 ranges", () => {
    for (const ip of ["192.168.1.5", "10.0.0.8", "172.16.0.1", "172.31.255.1"]) expect(isPrivateIPv4(ip)).toBe(true);
    for (const ip of ["172.15.0.1", "172.32.0.1", "8.8.8.8", "169.254.1.1", "127.0.0.1", "nope"]) expect(isPrivateIPv4(ip)).toBe(false);
  });
  it("flags virtual adapters", () => {
    for (const n of ["docker0", "veth123", "vboxnet0", "br-1a2b", "utun3", "vEthernet (WSL)"]) expect(isVirtualInterface(n)).toBe(true);
    for (const n of ["en0", "wlan0", "Wi-Fi", "eth0"]) expect(isVirtualInterface(n)).toBe(false);
  });
  it("prefers physical 192.168 over docker bridge and skips loopback/public", () => {
    const list = listLanCandidates({
      lo: [v4("127.0.0.1", true)],
      docker0: [v4("172.17.0.1")],
      eth1: [v4("203.0.113.9")],
      wlan0: [v4("192.168.1.42")],
      eth0: [v4("10.1.2.3")],
    });
    expect(list.map((c) => c.address)).toEqual(["192.168.1.42", "10.1.2.3", "172.17.0.1"]);
    expect(pickPrimary(list)).toBe("192.168.1.42");
    expect(list[2].virtual).toBe(true);
  });
  it("returns null when nothing is usable", () => {
    expect(pickPrimary(listLanCandidates({ lo: [v4("127.0.0.1", true)] }))).toBeNull();
  });
});
