import type { CSSProperties } from "react";
import type { Card, Points } from "@monikers/shared";
import { pointColor } from "@monikers/shared";

type Props = {
  card: Pick<Card, "text" | "description" | "points">;
  style?: CSSProperties;
  className?: string;
};

export function MonikerCard({ card, style, className }: Props) {
  const color = pointColor(card.points as Points);
  return (
    <article className={`moniker-card ${className ?? ""}`} style={style}>
      <h2 className="card-title">{card.text}</h2>
      <p className="card-desc">{card.description || "\u00a0"}</p>
      <div className="card-footer" style={{ color }}>
        <div className="card-category">Custom</div>
        <div className="point-badge" style={{ background: color }}>
          {card.points}
          <br />
          {card.points === 1 ? "POINT" : "POINTS"}
        </div>
      </div>
    </article>
  );
}
