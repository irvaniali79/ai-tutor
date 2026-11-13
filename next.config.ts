import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root to this project. Without this, Next.js infers the
  // root by scanning parent folders for lockfiles — a stray package-lock.json
  // in a parent (e.g. the user's home directory) makes it pick the WRONG root,
  // and the standalone output is then written outside the project, so
  // .next/standalone/server.js never exists ("copy-standalone: server.js not
  // found"). Explicit is cross-platform and immune to stray lockfiles.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // pdf-parse (pdfjs-dist) and mammoth ship large CJS bundles and native-ish
  // assets; loading them at runtime avoids bundling problems in the server
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
