import { useCallback, useState } from "react";

type Props = {
  code: string;
  variant: "lobby" | "header";
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function RoomCodeCopy({ code, variant }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className={`room-code-copy ${variant}`}>
      {variant === "lobby" ? (
        <div className="lobby-code">{code}</div>
      ) : (
        <div className="room-code">{code}</div>
      )}
      <button
        type="button"
        className={`btn-copy-code${copied ? " copied" : ""}`}
        onClick={() => void onCopy()}
        aria-label={copied ? "Room code copied" : "Copy room code"}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
