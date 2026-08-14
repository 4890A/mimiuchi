import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // `next dev` and `next build` share one output directory, so an end-to-end
  // run that builds the app would stomp on a dev server someone has open. The
  // e2e harness sets this to `.next-e2e` and leaves `.next` alone.
  distDir: process.env.KIKOERU_DIST_DIR || ".next",
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
