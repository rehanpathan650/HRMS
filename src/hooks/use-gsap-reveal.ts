"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Staggered dashboard entrance for children marked with `data-reveal`.
 * Runs once per `ready` flip, and is skipped entirely for reduced-motion users.
 */
export function useGsapReveal<T extends HTMLElement = HTMLDivElement>(ready = true) {
  const scope = useRef<T>(null);
  useGSAP(
    () => {
      // Background tabs pause rAF; animating there would leave content invisible.
      if (!ready || !scope.current || document.hidden) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = scope.current!.querySelectorAll("[data-reveal]");
        if (!items.length) return;
        gsap.fromTo(
          items,
          { autoAlpha: 0, y: 14, scale: 0.985 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.55,
            ease: "power3.out",
            stagger: { each: 0.045, from: "start" },
            clearProps: "transform,opacity,visibility",
          },
        );
      });
      return () => mm.revert();
    },
    { scope, dependencies: [ready] },
  );
  return scope;
}
