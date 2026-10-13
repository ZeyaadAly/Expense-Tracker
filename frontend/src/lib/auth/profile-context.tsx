"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "../api/profile";

const Context = createContext<{profile:Profile;setProfile:(value:Profile)=>void}|null>(null);
export function ProfileContext({profile,setProfile,children}:{profile:Profile;setProfile:(value:Profile)=>void;children:ReactNode}) {
  return <Context.Provider value={{profile,setProfile}}>{children}</Context.Provider>;
}
export function useOptionalProfile() { return useContext(Context); }
