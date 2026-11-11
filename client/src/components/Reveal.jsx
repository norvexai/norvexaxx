import React from "react";
import { useInView } from "../hooks";

/** Wraps children in an element that settles into place when scrolled into view. */
export default function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const [ref, seen] = useInView();
  return (
    <Tag ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ "--d": `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}
