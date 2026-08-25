import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow phone testing over the LAN. Next 16's dev server 403s
  // internal /_next assets for non-localhost hosts unless allow-listed,
  // which breaks hydration (blank greeting, dead nav). No effect in prod.
  // If the PC's DHCP address changes, update the IP here.
  allowedDevOrigins: ["192.168.0.229"],
  experimental: {
    // Repeat tab visits within 30s serve from the client router cache
    // (instant). Safe: every mutation is a Server Action, which invalidates
    // this cache; captures land on /board?new=… (a different cache key).
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
