"use client";
import { useEffect, useRef } from "react";

export type OrbState = "idle" | "connecting" | "listening" | "speaking";

/**
 * Fluid voice orb: a soft gradient blob whose outline is driven by layered sine "noise".
 * Amplitude follows the live audio level (mic while listening, Bell's voice while speaking).
 */
export function VoiceOrb({ state, level, size = 280 }: { state: OrbState; level: React.MutableRefObject<{ input: number; output: number }>; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const cv = canvas.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr; cv.height = size * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    let raf = 0, t = 0, amp = 0, hue = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      const st = stateRef.current;
      const raw = st === "speaking" ? level.current.output : st === "listening" ? level.current.input : 0;
      const target = st === "connecting" ? 0.08 + 0.05 * Math.sin(t * 3) : Math.min(1, raw * 5.5) * 0.32 + (st === "idle" ? 0.025 : 0.05);
      amp += (target - amp) * 0.18;
      hue += ((st === "speaking" ? 1 : 0) - hue) * 0.05;
      t += reduce ? 0.004 : st === "speaking" ? 0.028 : 0.014;

      const c = size / 2, R = size * 0.3;
      ctx.clearRect(0, 0, size, size);

      // glow
      const glow = ctx.createRadialGradient(c, c, R * 0.6, c, c, R * 1.65);
      glow.addColorStop(0, `rgba(${Math.round(47 + 70 * hue)}, ${Math.round(91 - 20 * hue)}, 234, ${0.22 + amp * 0.6})`);
      glow.addColorStop(1, "rgba(47, 91, 234, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // blob outline
      const N = 96;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const n = Math.sin(a * 3 + t * 2.1) * 0.5 + Math.sin(a * 5 - t * 1.7) * 0.3 + Math.sin(a * 2 + t * 3.3) * 0.2;
        const r = R * (1 + amp * n * 0.55 + amp * 0.12);
        const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const g = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
      g.addColorStop(0, `hsl(${222 + 40 * hue}, 90%, ${62 - 6 * hue}%)`);
      g.addColorStop(0.55, `hsl(${200 + 60 * hue}, 95%, 60%)`);
      g.addColorStop(1, `hsl(${255 + 20 * hue}, 85%, 66%)`);
      ctx.fillStyle = g;
      ctx.fill();

      // drifting inner clouds
      ctx.save();
      ctx.clip();
      for (let k = 0; k < 3; k++) {
        const ox = c + Math.cos(t * (0.7 + k * 0.3) + k * 2) * R * 0.45;
        const oy = c + Math.sin(t * (0.9 + k * 0.25) + k) * R * 0.45;
        const cg = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * (0.75 + 0.15 * k));
        cg.addColorStop(0, k === 1 ? "rgba(255,255,255,0.55)" : `rgba(${k ? 180 : 120}, ${k ? 120 : 220}, 255, 0.45)`);
        cg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(0, 0, size, size);
      }
      // specular highlight
      const hl = ctx.createRadialGradient(c - R * 0.35, c - R * 0.45, 0, c - R * 0.35, c - R * 0.45, R * 0.9);
      hl.addColorStop(0, "rgba(255,255,255,0.65)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, level]);

  return <canvas ref={canvas} style={{ width: size, height: size }} aria-hidden />;
}
