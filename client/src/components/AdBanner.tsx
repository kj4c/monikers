import { useEffect, useRef, useState } from "react";
import { ADSENSE_CLIENT, ADSENSE_SLOT, ADS_ENABLED } from "../adsense";

export function AdBanner() {
  const insRef = useRef<HTMLModElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ADS_ENABLED || !ADSENSE_SLOT || !insRef.current) return;
    const el = insRef.current;
    if (el.getAttribute("data-adsbygoogle-status")) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* script may still be loading */
    }

    const check = () => {
      const status = el.getAttribute("data-ad-status");
      if (status === "filled") {
        setVisible(true);
        return true;
      }
      if (status === "unfilled") {
        setVisible(false);
        return true;
      }
      // Fallback: real ads inject an iframe with height
      const iframe = el.querySelector("iframe");
      if (iframe) {
        const h = iframe.clientHeight || Number(iframe.getAttribute("height")) || 0;
        if (h > 20) {
          setVisible(true);
          return true;
        }
      }
      return false;
    };

    if (check()) return;

    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-ad-status", "data-adsbygoogle-status"],
      childList: true,
      subtree: true,
    });

    const poll = window.setInterval(() => {
      if (check()) window.clearInterval(poll);
    }, 500);
    const timeout = window.setTimeout(() => {
      window.clearInterval(poll);
      observer.disconnect();
      // Still empty after waiting — keep hidden
      if (!check()) setVisible(false);
    }, 8000);

    return () => {
      observer.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, []);

  if (!ADS_ENABLED || !ADSENSE_SLOT) return null;

  return (
    <aside
      className={`ad-banner${visible ? " is-filled" : " is-empty"}`}
      aria-label="Advertisement"
      aria-hidden={!visible}
    >
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
