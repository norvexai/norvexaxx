import React from "react";

export const Wordmark = () => <span className="brand">NORVEXA <small>INVEST GLOBAL</small></span>;

/** The hexagon-N mark. `draw` animates the strokes in. */
export function HexMark({ draw = false, size = 28 }) {
  return (
    <svg className={draw ? "hexmark draw" : "hexmark"} width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="hx-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F2F5FA"/><stop offset="1" stopColor="#8A97AA"/></linearGradient>
        <linearGradient id="hx-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8EDBFF"/><stop offset="1" stopColor="#1E6FD0"/></linearGradient>
      </defs>
      <path pathLength="1" className="hx-ring" d="M100 14 L174 57 V143 L100 186 L26 143 V57 Z" fill="none" stroke="url(#hx-silver)" strokeWidth="9" strokeLinejoin="round"/>
      <path pathLength="1" className="hx-n" d="M70 138 V66 L130 134 V62" fill="none" stroke="url(#hx-blue)" strokeWidth="13" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}
