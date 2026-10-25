import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide Next.js's development-only "N" indicator (bottom-left). Compile and
  // runtime errors are still shown in development; production never had it.
  devIndicators: false,
  /* This app is fundamentally dynamic (every page reads live data from the
   * local SQLite database), so Cache Components / partial prefetching (which
   * assume mostly-static routes) are disabled rather than fighting them with
   * Suspense boundaries on every page. */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
