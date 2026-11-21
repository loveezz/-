import type { NextConfig } from "next";

// Все запросы /api/* проксируются к серверной части на Go,
// поэтому cookie сессии работает в пределах одного домена без CORS.
const apiUrl = process.env.API_URL || "http://localhost:8090";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
