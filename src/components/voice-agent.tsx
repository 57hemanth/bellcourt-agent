"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Lock, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import type { LiveServerMessage, Session } from "@google/genai";
import { VoiceOrb, type OrbState } from "./voice-orb";
import { cx } from "./ui";

type Line = { who: "caller" | "bell" | "system"; text: string; final: boolean };

// AudioWorklet: mic Float32 frames → posted to the main thread in ~64 ms batches.
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; } }
    return true;
  }
}
registerProcessor("bell-capture", Capture);`;

const toBase64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const rms = (a: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };

export function VoiceAgent() {
  const [state, setState] = useState<OrbState>("idle");
  const [live, setLive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const level = useRef({ input: 0, output: 0 });
  const r = useRef<{ session?: Session; inCtx?: AudioContext; outCtx?: AudioContext; stream?: MediaStream; outAnalyser?: AnalyserNode; nextAt: number; sources: Set<AudioBufferSourceNode>; muted: boolean; raf?: number; timer?: ReturnType<typeof setInterval> }>({ nextAt: 0, sources: new Set(), muted: false });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [lines]);
  useEffect(() => () => hangUp(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (who: Line["who"], text: string, final = false) =>
    setLines((ls) => {
      const last = ls.at(-1);
      if (last && last.who === who && !last.final) return [...ls.slice(0, -1), { who, text: last.text + text, final }];
      return [...ls, { who, text, final }];
    });
  const finalize = () => setLines((ls) => ls.map((l) => ({ ...l, final: true })));

  function stopPlayback() {
    for (const s of r.current.sources) { try { s.stop(); } catch {} }
    r.current.sources.clear();
    r.current.nextAt = 0;
  }

  function play(b64: string) {
    const ctx = r.current.outCtx!;
    const bin = atob(b64);
    const pcm = new Int16Array(bin.length / 2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(r.current.outAnalyser!);
    const at = Math.max(ctx.currentTime + 0.02, r.current.nextAt);
    src.start(at);
    r.current.nextAt = at + buf.duration;
    r.current.sources.add(src);
    src.onended = () => { r.current.sources.delete(src); if (!r.current.sources.size) setState("listening"); };
    setState("speaking");
  }

  async function onMessage(m: LiveServerMessage) {
    const sc = m.serverContent;
    if (sc?.interrupted) { stopPlayback(); setState("listening"); }
    for (const p of sc?.modelTurn?.parts ?? []) if (p.inlineData?.data) play(p.inlineData.data);
    if (sc?.inputTranscription?.text) say("caller", sc.inputTranscription.text);
    if (sc?.outputTranscription?.text) say("bell", sc.outputTranscription.text);
    if (sc?.turnComplete) finalize();
    if (m.toolCall?.functionCalls?.length) {
      say("system", "Looking up the case…", true);
      const responses = await Promise.all(m.toolCall.functionCalls.map(async (fc) => {
        const res = await fetch("/api/voice/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fc.args ?? {}) }).then((x) => x.json()).catch(() => ({ verified: false, message: "Lookup failed" }));
        say("system", res.verified ? `Verified · ${res.case_id} · ${res.status}` : "Could not verify that case number and date of birth", true);
        return { id: fc.id, name: fc.name, response: res };
      }));
      r.current.session?.sendToolResponse({ functionResponses: responses });
    }
  }

  async function call() {
    setError(null); setLines([]); setSeconds(0); setState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const tok = await fetch("/api/voice/token", { method: "POST" });
      const tj = await tok.json();
      if (!tok.ok) throw new Error(tj.error ?? "Could not start the call");

      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      const outAnalyser = outCtx.createAnalyser(); outAnalyser.fftSize = 512; outAnalyser.connect(outCtx.destination);
      const inAnalyser = inCtx.createAnalyser(); inAnalyser.fftSize = 512;
      await inCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
      const srcNode = inCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(inCtx, "bell-capture");
      srcNode.connect(inAnalyser); srcNode.connect(worklet);
      Object.assign(r.current, { inCtx, outCtx, stream, outAnalyser, nextAt: 0, muted: false });

      const { GoogleGenAI, Modality } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: tj.token, httpOptions: { apiVersion: "v1alpha" } });
      const session = await ai.live.connect({
        model: tj.model,
        config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {} },
        callbacks: {
          onopen: () => {},
          onmessage: (m) => { void onMessage(m); },
          onerror: (e) => setError((e as ErrorEvent).message || "Connection error"),
          onclose: () => { if (r.current.session) hangUp(); },
        },
      });
      r.current.session = session;

      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (r.current.muted || !r.current.session) return;
        const f = e.data, pcm = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
        r.current.session.sendRealtimeInput({ audio: { data: toBase64(new Uint8Array(pcm.buffer)), mimeType: "audio/pcm;rate=16000" } });
      };

      const tin = new Float32Array(512), tout = new Float32Array(512);
      const meter = () => {
        inAnalyser.getFloatTimeDomainData(tin); outAnalyser.getFloatTimeDomainData(tout);
        level.current = { input: r.current.muted ? 0 : rms(tin), output: rms(tout) };
        r.current.raf = requestAnimationFrame(meter);
      };
      meter();
      r.current.timer = setInterval(() => setSeconds((s) => s + 1), 1000);
      setLive(true); setState("listening");
      say("system", "Connected to Bell", true);
      session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "(A provider office has just called the status line. Greet them.)" }] }], turnComplete: true });
    } catch (e) {
      setError((e as Error).name === "NotAllowedError" ? "Microphone permission is needed to call Bell." : (e as Error).message);
      hangUp();
    }
  }

  function hangUp() {
    const c = r.current;
    const s = c.session; c.session = undefined;
    try { s?.close(); } catch {}
    stopPlayback();
    c.stream?.getTracks().forEach((t) => t.stop());
    c.inCtx?.close().catch(() => {}); c.outCtx?.close().catch(() => {});
    if (c.raf) cancelAnimationFrame(c.raf);
    if (c.timer) clearInterval(c.timer);
    Object.assign(c, { inCtx: undefined, outCtx: undefined, stream: undefined });
    level.current = { input: 0, output: 0 };
    setLive(false); setState("idle"); setMuted(false);
  }

  const toggleMute = () => { r.current.muted = !r.current.muted; setMuted(r.current.muted); };
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const caption = state === "connecting" ? "Connecting…" : state === "speaking" ? "Bell is speaking" : live ? (muted ? "Muted" : "Listening…") : "Call Bell for a status update";

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="card relative flex flex-col items-center overflow-hidden px-6 py-10 lg:col-span-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,rgba(47,91,234,0.08),transparent_70%)]" />
        <div className="relative">
          <VoiceOrb state={state} level={level} size={300} />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={caption} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="relative mt-2 text-[15px] font-medium text-ink">{caption}</motion.div>
        </AnimatePresence>
        <div className="relative mt-1 h-5 text-[12.5px] tabular-nums text-ink-3">{live ? mmss : "Say the case number and the patient\u2019s date of birth"}</div>

        <div className="relative mt-7 flex items-center gap-3">
          {!live ? (
            <motion.button onClick={call} disabled={state === "connecting"} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-white shadow-[0_10px_30px_-10px_rgba(11,18,32,.6)] disabled:opacity-60">
              <Phone size={16} /> {state === "connecting" ? "Connecting…" : "Call Bell"}
            </motion.button>
          ) : (
            <>
              <motion.button onClick={toggleMute} whileTap={{ scale: 0.94 }} className={cx("grid h-12 w-12 place-items-center rounded-full border transition", muted ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-line-2")} aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <MicOff size={18} /> : <Mic size={18} />}
              </motion.button>
              <motion.button onClick={hangUp} whileTap={{ scale: 0.94 }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid h-14 w-14 place-items-center rounded-full bg-fail text-white shadow-[0_10px_30px_-10px_rgba(217,45,75,.8)]" aria-label="End call">
                <PhoneOff size={20} />
              </motion.button>
            </>
          )}
        </div>
        {error && <div className="relative mt-4 rounded-lg bg-fail-soft px-3 py-2 text-[12.5px] text-fail">{error}</div>}
        <div className="relative mt-8 flex items-center gap-1.5 text-[11.5px] text-ink-3"><Lock size={12} /> Case details are shared only after the case number and patient date of birth match.</div>
      </section>

      <aside className="card flex min-h-[460px] flex-col p-5 lg:col-span-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-[.08em] text-ink-3">Live transcript</h3>
          {live && <span className="flex items-center gap-1.5 text-[11.5px] text-fail"><motion.span className="h-2 w-2 rounded-full bg-fail" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} /> Live</span>}
        </div>
        <div ref={scroller} className="-mx-1 flex-1 space-y-2.5 overflow-y-auto px-1">
          {lines.length === 0 && (
            <div className="space-y-2 pt-6 text-[13px] text-ink-3">
              <p>Try saying:</p>
              <p className="rounded-lg bg-canvas px-3 py-2 text-ink-2">&ldquo;Case two, date of birth July twelfth, 1979.&rdquo;</p>
            </div>
          )}
          <AnimatePresence initial={false}>
            {lines.map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cx("flex", l.who === "caller" ? "justify-end" : l.who === "system" ? "justify-center" : "justify-start")}>
                {l.who === "system" ? (
                  <span className="rounded-full bg-line-2 px-2.5 py-0.5 text-[11.5px] text-ink-3">{l.text}</span>
                ) : (
                  <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed", l.who === "caller" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-brand-soft text-ink")}>
                    <div className={cx("mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide", l.who === "caller" ? "text-white/60" : "text-brand")}>{l.who === "caller" ? "You" : "Bell"}</div>
                    {l.text.trim()}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
}
