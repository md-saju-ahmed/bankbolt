"use client";

import { useEffect, useRef, useState } from "react";
import { errorCode } from "@/features/auth/auth-api";
import { onboardingError } from "@/features/onboarding/form-ui";

export function useDocumentDownload(label: "receipt" | "statement") {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function reset() {
    setError("");
    setStatus("");
  }

  async function download(path: string, filename: string, mediaType: string) {
    if (request.current) return;
    reset();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    const fallback = `Unable to download this ${label}. Try again.`;
    try {
      const response = await fetch(path, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => undefined);
        if (!controller.signal.aborted) {
          setError(
            errorCode({ data }) === "STATEMENT_TOO_LARGE"
              ? "This statement is too large. Choose a shorter date range."
              : onboardingError({ data }, fallback),
          );
        }
        return;
      }
      if (response.headers.get("content-type")?.split(";")[0] !== mediaType) {
        setError(fallback);
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Download started.");
    } catch {
      if (!controller.signal.aborted) setError(fallback);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return { busy, error, status, download, reset, setError };
}
