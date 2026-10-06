"use client";
import { createContext, useContext, useSyncExternalStore } from "react";
import { CitationDrawerProvider } from "./citation-drawer";

export interface Persona { id: string; name: string; role: "nurse" | "physician"; title: string; licensedStates: string[] }
export const PERSONAS: Persona[] = [
  { id: "rn-reyes", name: "Anita Reyes, RN", role: "nurse", title: "Senior Nurse Reviewer", licensedStates: ["TN", "AZ", "TX", "GA"] },
  { id: "rn-patel", name: "Marcus Patel, RN", role: "nurse", title: "Nurse Reviewer", licensedStates: ["TN"] },
  { id: "md-vasquez", name: "Dr. Elena Vasquez", role: "physician", title: "Medical Director · AZ, TX licensed", licensedStates: ["AZ", "TX"] },
  { id: "md-okonjo", name: "Dr. Samuel Okonjo", role: "physician", title: "Chief Medical Officer · TN, GA licensed", licensedStates: ["TN", "GA"] },
];

const KEY = "bell.persona";
const readPersonaId = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("bell-persona", cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener("bell-persona", cb); };
}

const Ctx = createContext<{ persona: Persona | null; setPersona: (p: Persona | null) => void; ready: boolean }>({ persona: null, setPersona: () => {}, ready: false });
export const usePersona = () => useContext(Ctx);

export function Providers({ children }: { children: React.ReactNode }) {
  const personaId = useSyncExternalStore(subscribe, readPersonaId, () => null);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const persona = PERSONAS.find((p) => p.id === personaId) ?? null;
  const setPersona = (p: Persona | null) => {
    try { if (p) localStorage.setItem(KEY, p.id); else localStorage.removeItem(KEY); } catch {}
    window.dispatchEvent(new Event("bell-persona"));
  };
  return (
    <Ctx.Provider value={{ persona, setPersona, ready }}>
      <CitationDrawerProvider>{children}</CitationDrawerProvider>
    </Ctx.Provider>
  );
}

/** fetch with the signed-in persona header (Bell console calls). */
export function bellFetch(persona: Persona | null, url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { ...(init.headers ?? {}), ...(persona ? { "x-bell-persona": persona.id } : {}) }, cache: "no-store" });
}
