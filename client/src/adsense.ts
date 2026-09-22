/** Override with VITE_ADSENSE_SLOT if needed. */
export const ADSENSE_CLIENT = "ca-pub-5167461828752806";
export const ADSENSE_SLOT =
  import.meta.env.VITE_ADSENSE_SLOT?.trim() || "7122824385";

/**
 * While AdSense is under review / unfilled, set VITE_SHOW_ADS=false
 * in client/.env to hide the banner entirely.
 * Defaults to on so production can serve ads when approved.
 */
export const ADS_ENABLED =
  (import.meta.env.VITE_SHOW_ADS ?? "true").toLowerCase() !== "false";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export {};
