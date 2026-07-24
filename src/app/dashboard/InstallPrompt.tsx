"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "aftercast:install-prompt-dismissed";
const dismissListeners = new Set<() => void>();

function subscribeDismissed(listener: () => void) {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}

function getDismissedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Best-effort; worst case the prompt reappears next visit.
  }
  dismissListeners.forEach((listener) => listener());
}

function subscribeNever() {
  return () => {};
}

function getStandaloneSnapshot(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Both default to "hidden" on the server / pre-hydration render, so the
// banner never flashes before the real client state is known.
function getServerSnapshotTrue() {
  return true;
}

export function InstallPrompt({ hasAnyPrediction }: { hasAnyPrediction: boolean }) {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    getServerSnapshotTrue,
  );
  const standalone = useSyncExternalStore(subscribeNever, getStandaloneSnapshot, getServerSnapshotTrue);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!hasAnyPrediction || standalone || dismissed || !deferredEvent) return null;

  async function handleInstall() {
    await deferredEvent!.prompt();
    await deferredEvent!.userChoice;
    setDeferredEvent(null);
    persistDismissed();
  }

  return (
    <div className="mt-8 flex flex-col gap-2 rounded-xl border border-border bg-canvas p-4 text-sm shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
      <p className="text-ink-secondary">Install Aftercast for quicker access to your predictions.</p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={persistDismissed} className={buttonVariants("ghost", { size: "sm" })}>
          Not now
        </button>
        <button type="button" onClick={handleInstall} className={buttonVariants("primary", { size: "sm" })}>
          Install
        </button>
      </div>
    </div>
  );
}
