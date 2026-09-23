"use client";

import { useEffect, useState } from "react";

import {
  defaultAccountPreferences,
  parseAccountPreferences,
  type AccountPreferences,
} from "@/lib/account-preferences";

const storageKey = "peerslot:account-preferences";

export function useAccountPreferences() {
  const [preferences, setPreferences] = useState<AccountPreferences>(
    defaultAccountPreferences,
  );

  useEffect(() => {
    const read = () => {
      try {
        setPreferences(
          parseAccountPreferences(
            JSON.parse(localStorage.getItem(storageKey) ?? "null"),
          ),
        );
      } catch {
        setPreferences(defaultAccountPreferences);
      }
    };
    read();
    window.addEventListener("peerslot:preferences-change", read);
    return () => window.removeEventListener("peerslot:preferences-change", read);
  }, []);

  return preferences;
}
