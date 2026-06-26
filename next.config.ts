/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript hatalarını derleme aşamasında yoksay/atla
  typescript: {
    ignoreBuildErrors: true,
  },
  // ESLint hatalarını derleme aşamasında yoksay/atla
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;