import os from "node:os";
import type { NetworkCandidate } from "@/shared/types";

export type InterfaceMap = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/** RFC1918 private IPv4: 10/8, 172.16/12, 192.168/16. */
export function isPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return a === 192 && b === 168;
}

const VIRTUAL_NAME = /(docker|veth|br-|virbr|vmnet|vboxnet|vethernet|hyper-v|wsl|utun|tailscale|zerotier|zt\w|tun\d|tap\d|vpn|loopback|lo\d?$|podman|cni|flannel|kube)/i;

export function isVirtualInterface(name: string): boolean {
  return VIRTUAL_NAME.test(name);
}

function rank(c: NetworkCandidate): number {
  // Prefer physical adapters; then 192.168 (home/campus Wi-Fi) > 10.x > 172.16/12.
  const base = c.virtual ? 100 : 0;
  if (c.address.startsWith("192.168.")) return base;
  if (c.address.startsWith("10.")) return base + 1;
  return base + 2;
}

/** All private IPv4 candidates, best first. Pure: takes the interface map as input. */
export function listLanCandidates(ifaces: InterfaceMap = os.networkInterfaces()): NetworkCandidate[] {
  const out: NetworkCandidate[] = [];
  for (const [name, infos] of Object.entries(ifaces)) {
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (!isPrivateIPv4(info.address)) continue;
      out.push({ address: info.address, iface: name, virtual: isVirtualInterface(name) });
    }
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.address.localeCompare(b.address));
}

export function pickPrimary(candidates: NetworkCandidate[]): string | null {
  return candidates[0]?.address ?? null;
}
