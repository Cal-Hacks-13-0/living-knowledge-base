import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
