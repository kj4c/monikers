import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSocket } from "../socket";
import { getStoredName } from "../session";

type NavState = {
  needName?: boolean;
  joinCode?: string;
  message?: string;
};

export function HomePage() {
  const { createRoom, joinRoom } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as NavState | null) ?? null;

  const [name, setName] = useState(() => getStoredName());
  const [code, setCode] = useState(() => navState?.joinCode ?? "");
  const [mode, setMode] = useState<"create" | "join">(
    navState?.joinCode ? "join" : "create"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    message: string;
  }>(() =>
    navState?.needName
      ? {
          open: true,
          message:
            navState.message ??
            "Please enter your name before joining a room.",
        }
      : { open: false, message: "" }
  );
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (navState?.needName || navState?.joinCode) {
      navigate(".", { replace: true, state: null });
    }
  }, [navState, navigate]);

  useEffect(() => {
    if (dialog.open) {
      nameRef.current?.focus();
    }
  }, [dialog.open]);

  const submit = async () => {
    setErr(null);
    const n = name.trim();
    if (!n) {
      setErr("Enter your name");
      setDialog({
        open: true,
        message: "Please enter your name before joining a room.",
      });
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        const roomCode = await createRoom(n);
        navigate(`/room/${roomCode}`);
      } else {
        if (!code.trim()) {
          setErr("Enter a room code");
          setBusy(false);
          return;
        }
        const roomCode = await joinRoom(code.trim().toUpperCase(), n);
        navigate(`/room/${roomCode}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="brand-hero">
        <h1 className="brand-title">Monikers</h1>
        <p className="brand-sub">Pass the phone. Make them guess.</p>
      </header>
      <section className="panel stack">
        <div className="row">
          <button
            type="button"
            className={mode === "create" ? "btn-primary" : "btn-secondary"}
            onClick={() => setMode("create")}
          >
            Create
          </button>
          <button
            type="button"
            className={mode === "join" ? "btn-primary" : "btn-secondary"}
            onClick={() => setMode("join")}
          >
            Join
          </button>
        </div>
        <input
          ref={nameRef}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          autoComplete="nickname"
        />
        {mode === "join" && (
          <input
            placeholder="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
          />
        )}
        {err && <div className="error-banner">{err}</div>}
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "…" : mode === "create" ? "Create room" : "Join room"}
        </button>
      </section>

      {dialog.open && (
        <div
          className="modal-backdrop"
          onClick={() => setDialog((d) => ({ ...d, open: false }))}
        >
          <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
            <h3>Enter your name</h3>
            <p className="hint" style={{ margin: 0 }}>
              {dialog.message}
            </p>
            {code && (
              <p className="hint" style={{ margin: 0 }}>
                Room <strong>{code}</strong> is ready — add your name below,
                then tap Join room.
              </p>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setDialog((d) => ({ ...d, open: false }));
                setMode("join");
                nameRef.current?.focus();
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
