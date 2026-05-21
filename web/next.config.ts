import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["192.168.1.127", "100.81.249.3"],
  serverExternalPackages: [
    "better-sqlite3",
    "kuroshiro",
    "kuroshiro-analyzer-kuromoji",
    "kuromoji",
  ],
};

export default nextConfig;
