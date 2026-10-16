import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables standalone server tracing for the production Docker container
  output: "standalone",

  // Allows this app's dev server to be previewed through a proxied sandbox
  // host (e.g. Arena's *.e2b.app preview URLs) without Next.js blocking HMR/
  // font requests as cross-origin. Harmless in real local dev or production.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
