"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

import { AppIcon } from "@/components/dock-icons";

export function CloudLogoutAction({
  buttonClassName,
  popoverClassName,
  returnTo,
  shellClassName
}: {
  buttonClassName?: string;
  popoverClassName?: string;
  returnTo: string;
  shellClassName?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setConfirmOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirmOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmOpen]);

  return (
    <div
      className={clsx(
        "dock-toolbar-confirm-shell",
        shellClassName,
        confirmOpen && "is-open"
      )}
      ref={shellRef}
    >
      <button
        aria-label="Log out"
        className={clsx(
          "dock-icon-button",
          "cloud-remote-icon-button",
          buttonClassName,
          confirmOpen && "is-armed"
        )}
        onClick={() => setConfirmOpen((current) => !current)}
        title="Log out"
        type="button"
      >
        <AppIcon className="cloud-remote-inline-icon" name="logout" />
      </button>

      {confirmOpen ? (
        <div
          aria-modal="false"
          className={clsx("dock-toolbar-confirm-popover", popoverClassName)}
          role="dialog"
        >
          <div className="dock-toolbar-confirm-copy">
            <strong>Log out of this cloud session?</strong>
            <span>Your linked node stays registered. Only this browser session ends.</span>
          </div>
          <div className="dock-toolbar-confirm-actions">
            <form action="/api/cloud/auth/logout" method="post">
              <input name="returnTo" type="hidden" value={returnTo} />
              <button className="dock-request-action is-primary" type="submit">
                Log out
              </button>
            </form>
            <button
              className="dock-ghost-action is-muted"
              onClick={() => setConfirmOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
