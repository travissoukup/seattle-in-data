/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard renders from build-time aggregate JSON (no runtime DB), so
  // every page is statically generated. reactStrictMode catches issues early.
  reactStrictMode: true,
  // This app is self-contained; pin the file-tracing root to it so Next does
  // not walk up to sibling lockfiles when inferring the workspace root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
