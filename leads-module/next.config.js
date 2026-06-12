/** @type {import('next').NextConfig} */
const nextConfig = {
      typescript: {
              ignoreBuildErrors: true,
      },
      eslint: {
              ignoreDuringBuilds: true,
      },
      experimental: {
              typedRoutes: false,
      },
      serverExternalPackages: ["@prisma/client"],
      async headers() {
              return [
                  {
                              source: "/api/:path*",
                              headers: [
                                  { key: "Access-Control-Allow-Origin", value: "*" },
                                  { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
                                  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
                                          ],
                  },
                      ];
      },
};

export default nextConfig;
