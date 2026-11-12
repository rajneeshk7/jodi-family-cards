"use client";
import { useRef } from "react";
import type { Card, Suit } from "@/lib/game";

const SUIT_PATH: Record<Suit, string> = {
  H: "M12 21s-8-5.2-8-11.2C4 6.6 6.4 4.5 9 4.5c1.3 0 2.4.7 3 1.8.6-1.1 1.7-1.8 3-1.8 2.6 0 5 2.1 5 5.3C20 15.800 12 21 12 21z",
  D: "M12 2.5 19.5 12 12 21.5 4.500 12z",
  S: "M12 2.500s8 5.600 8 11.300c0 2.700-2 4.400-4.300 4.400-1.100 0-2.100-.4-2.800-1.200.2 1.700.8 3 2.100 4.500H9c1.300-1.500 1.900-2.800 2.100-4.500-.7.8-1.700 1.200-2.800 1.200C6 18.200 4 16.500 4 13.800 4 8.100 12 2.500 12 2.500z",
  C: "M12 2.500a4.300 4.300 0 0 1 3.600 6.700A4.300 4.300 0 1 1 13 16.800c.2 1.600.8 3.100 2 4.700H9c1.200-1.600 1.800-3.100 2-4.700a4.300 4.300 0 1 1-2.600-7.600A4.300 4.300 0 0 1 12 2.500z",
};
export const SUIT_NAME: Record<Suit, string> = { H: "hearts", D: "diamonds", S: "spades", C: "clubs" };

export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={SUIT_PATH[suit]} fill="currentColor" />
    </svg>
  );
}

type Props = {
  card: Card | null; // null = we do not know what it is (face down)
  up: boolean;
  wonColor?: string;
  wonAvatar?: string;
  fresh?: boolean; // just matched
  miss?: boolean; // wrong pair, about to turn back
  busy?: boolean;
  tappable?: boolean;
  label: string;
  onTap?: () => void;
};

export default function PlayingCard({ card, up, wonColor, wonAvatar, fresh, miss, busy, tappable, label, onTap }: Props) {
  // Keep drawing the face while the card turns back over.
  const lastSeen = useRef<Card | null>(null);
  if (card) lastSeen.current = card;
  const c = card ?? lastSeen.current;
  const red = c ? c.s === "H" || c.s === "D" : false;
  const royal = c ? ["J", "Q", "K"].includes(c.r) : false;

  return (
    <button
      type="button"
      className="pcard"
      data-up={up}
      data-won={!!wonColor}
      data-fresh={!!fresh}
      data-miss={!!miss}
      data-busy={!!busy}
      data-tappable={!!tappable}
      style={wonColor ? ({ "--won": wonColor } as React.CSSProperties) : undefined}
      aria-label={up && c ? `${c.r} of ${SUIT_NAME[c.s]}` : label}
      disabled={!tappable}
      onClick={onTap}
    >
      {wonAvatar && <span className="pcard-owner">{wonAvatar}</span>}
      <span className="pcard-inner">
        <span className="pcard-side pcard-back" />
        <span className="pcard-side pcard-face" data-red={red}>
          {c && (
            <>
              <span className="pcard-corner">
                {c.r}
                <SuitIcon suit={c.s} />
              </span>
              <span className="pcard-center">
                {royal ? <span className="pcard-royal">{c.r}</span> : <SuitIcon suit={c.s} />}
              </span>
              <span className="pcard-corner flip">
                {c.r}
                <SuitIcon suit={c.s} />
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}
