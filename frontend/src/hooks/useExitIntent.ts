"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "realrest_exit_intent_shown";

/**
 * Fires once per browser session when the visitor looks like they're about to leave:
 * desktop — mouse exits toward the top of the viewport (classic exit-intent);
 * mobile — the hardware/gesture back button is pressed (no mouse to track).
 */
export function useExitIntent() {
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;

    function fire() {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
      setTriggered(true);
    }

    function onMouseLeave(e: MouseEvent) {
      if (e.clientY <= 0) fire();
    }

    // Push a dummy history entry so the first back-press is interceptable rather than
    // immediately navigating away.
    history.pushState(null, "", location.href);
    function onPopState() {
      fire();
    }

    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return { triggered, dismiss: () => setTriggered(false) };
}
