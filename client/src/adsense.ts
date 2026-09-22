/** Paste your display ad unit slot from AdSense, or set VITE_ADSENSE_SLOT. */
export const ADSENSE_CLIENT = "ca-pub-5167461828752806";
export const ADSENSE_SLOT =
  import.meta.env.VITE_ADSENSE_SLOT?.trim() || "";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export {};
