import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server build for Docker/VPS deploys.
  output: "standalone",
  // firebase-admin relies on Node.js built-ins and must not be bundled.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
