import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/cboe/:path*",
        destination: "https://cdn.cboe.com/api/global/delayed_quotes/:path*",
      },
    ];
  },
};

export default nextConfig;
