import { Spinner } from "./Spinner";

type Props = {
  label: string;
};

export function LoadingPanel({ label }: Props) {
  return (
    <div className="loading-panel" role="status" aria-live="polite">
      <Spinner size="lg" />
      <p className="loading-panel-label">{label}</p>
    </div>
  );
}
