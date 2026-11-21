import type { NextConfig } from "next";

function apiOrigin() {
  const onVercel = process.env.VERCEL === "1";
  const value =
    process.env.API_ORIGIN ?? (onVercel ? undefined : "http://localhost:4000");

  if (!value) {
    throw new Error("Set API_ORIGIN to the Express API origin.");
  }

  const url = URL.parse(value);
  if (
    !url ||
    (url.protocol !== "https:" && (onVercel || url.protocol !== "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "API_ORIGIN must be an HTTP(S) origin with no path or credentials. Vercel requires HTTPS.",
    );
  }

  return url.origin;
}

const config: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin()}/api/v1/:path*`,
      },
    ];
  },
};

export default config;
