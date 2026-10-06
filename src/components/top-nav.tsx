"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Network } from "lucide-react";
import { usePersona } from "./providers";
import { BellMark } from "./ui";


export function TopNav() {
  const path = usePathname();
  const router = useRouter();
  const { persona, setPersona } = usePersona();
  const active = path.startsWith("/dashboard") ? "/dashboard" : "/provider";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-4 px-4 sm:px-6">
        <Link href={active} className="flex items-center gap-2">
          <BellMark />
          <span className="text-[15px] font-semibold tracking-tight">Bell</span>
          <span className="hidden text-[13px] text-ink-3 sm:inline">{active === "/dashboard" ? "Clinical console" : "Provider portal"}</span>
        </Link>


        <div className="ml-auto flex items-center gap-3">
          {active === "/dashboard" && persona && (
            <>
              <Link href="/dashboard/knowledge" className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] sm:flex ${path.startsWith("/dashboard/knowledge") ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-line-2"}`}>
                <Network size={15} /> Knowledge graph
              </Link>
              <div className="flex items-center gap-2.5 border-l border-line pl-3">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">
                  {persona.name.replace("Dr. ", "").split(" ").map((x) => x[0]).slice(0, 2).join("")}
                </div>
                <div className="hidden leading-tight md:block">
                  <div className="text-[13px] font-medium">{persona.name}</div>
                  <div className="text-[11px] capitalize text-ink-3">{persona.role}</div>
                </div>
                <button onClick={() => { setPersona(null); router.push("/dashboard"); }} className="rounded-md p-1.5 text-ink-3 hover:bg-line-2 hover:text-ink" aria-label="Sign out">
                  <LogOut size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
