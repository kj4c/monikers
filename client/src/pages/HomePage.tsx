import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AdBanner } from "../components/AdBanner";
import { Spinner } from "../components/Spinner";
import { isAdminUnlocked, setAdminSecret } from "../admin";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navState = (location.state as NavState | null) ?? null;

  const [name, setName] = useState(() => getStoredName());
  const [code, setCode] = useState(() => navState?.joinCode ?? "");
  const [mode, setMode] = useState<"create" | "join">(
    navState?.joinCode ? "join" : "create"
  );
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(() => isAdminUnlocked());
  const [noAds, setNoAds] = useState(() => isAdminUnlocked());
  const [err, setErr] = useState<string | null>(
    () => navState?.message ?? null
  );
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
    const secret = searchParams.get("admin");
    if (secret == null) return;
    if (secret) {
      setAdminSecret(secret);
      setAdmin(true);
      setNoAds(true);
    } else {
      setAdminSecret(null);
      setAdmin(false);
      setNoAds(false);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("admin");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (navState?.needName || navState?.joinCode || navState?.message) {
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
        const roomCode = await createRoom(n, {
          noAds: admin && noAds,
        });
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
    <div className="app-shell home-page">
      <div className="home-layout">
        <header className="brand-hero">
          <h1 className="brand-title">Monikers</h1>
          <p className="brand-sub">boutta be madness ting</p>
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
          {admin && mode === "create" && (
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={noAds}
                onChange={(e) => setNoAds(e.target.checked)}
              />
              <span>Create without ads</span>
            </label>
          )}
          {err && <div className="error-banner">{err}</div>}
          <button
            type="button"
            className={`btn-primary${busy ? " is-loading" : ""}`}
            disabled={busy}
            onClick={() => void submit()}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <Spinner size="sm" tone="light" />
                {mode === "create" ? "Creating room…" : "Joining room…"}
              </>
            ) : mode === "create" ? (
              admin && noAds ? "Create ad-free room" : "Create room"
            ) : (
              "Join room"
            )}
          </button>
          {admin && <p className="hint admin-hint">Admin mode on</p>}
        </section>
      </div>
      {!(admin && noAds && mode === "create") && <AdBanner />}

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
