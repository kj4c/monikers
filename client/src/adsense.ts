/** Override with VITE_ADSENSE_SLOT if needed. */
export const ADSENSE_CLIENT = "ca-pub-5167461828752806";
export const ADSENSE_SLOT =
  import.meta.env.VITE_ADSENSE_SLOT?.trim() || "7122824385";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export {};
