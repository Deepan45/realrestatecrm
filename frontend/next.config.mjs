/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    // Proxy uploaded images through the frontend origin in dev
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const backendOrigin = api.replace(/\/api$/, "");
    return [{ source: "/uploads/:path*", destination: `${backendOrigin}/uploads/:path*` }];
  },
};

export default nextConfig;
