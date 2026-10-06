import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [{ source: "/bell/:path*", destination: "/dashboard/:path*", permanent: false }];
  },
};

export default nextConfig;
