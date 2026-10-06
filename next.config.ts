import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Files read with fs at runtime must be bundled into the serverless functions.
  outputFileTracingIncludes: {
    "/api/**": ["./data/seed/**", "./public/samples/**"],
  },
  async redirects() {
    return [{ source: "/bell/:path*", destination: "/dashboard/:path*", permanent: false }];
  },
};

export default nextConfig;
