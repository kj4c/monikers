type Props = {
  /** Larger spinner for full-page loading */
  size?: "sm" | "md" | "lg";
  /** On red/dark backgrounds use light */
  tone?: "default" | "light";
  className?: string;
};

export function Spinner({
  size = "md",
  tone = "default",
  className = "",
}: Props) {
  return (
    <span
      className={`spinner spinner-${size} spinner-${tone}${className ? ` ${className}` : ""}`}
      role="status"
      aria-hidden="true"
    />
  );
}
