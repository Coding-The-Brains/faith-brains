import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone", // slim self-contained server for the Docker image
  async rewrites() {
    // Same-origin proxy to FastAPI — no CORS in the browser.
    return [{ source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` }];
  },
  async redirects() {
    // Forgiving URLs people type by habit
    return [
      { source: "/home", destination: "/", permanent: false },
      { source: "/ask", destination: "/", permanent: false },
      { source: "/login", destination: "/account", permanent: false },
      { source: "/signin", destination: "/account", permanent: false },
      { source: "/signup", destination: "/account", permanent: false },
    ];
  },
};

export default nextConfig;
