"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import * as auth from "./auth-service";
import { createSessionStore } from "./session-store";
const Context = createContext<ReturnType<typeof useSessionLayer> | null>(null);
function useSessionLayer() {
  const [store] = useState(() => createSessionStore(auth));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => {
    const stop = store.start();
    const recheck = () => { void store.recheck(); };
    const visible = () => { if (document.visibilityState === "visible") recheck(); };
    window.addEventListener("pageshow", recheck);
    document.addEventListener("visibilitychange", visible);
    return () => { stop(); window.removeEventListener("pageshow", recheck); document.removeEventListener("visibilitychange", visible); };
  }, [store]);
  return { ...state, user: state.session?.user ?? null, signOut: store.signOut, refreshSession: store.recheck };
}
export function AuthProvider({ children }: { children: ReactNode }) { const value = useSessionLayer(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useAuth() { const context = useContext(Context); if (!context) throw new Error("V2 AuthProvider required"); return context; }
