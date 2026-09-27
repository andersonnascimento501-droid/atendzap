import { createFileRoute, redirect } from "@tanstack/react-router";
import { brand, supportWhatsappUrl } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { fetchAtendaiPeriodos, formatBRL, periodoResumo, DEFAULT_PERIODO_SLUG, type AtendaiPeriodo } from "@/lib/atendai-plan";
import {
  Zap,
  Play,
  Check,
  MessageSquareText,
  Bot,
  KanbanSquare,
  Users,
  PauseCircle,
  LineChart,
  Star,
  ArrowRight,
  Plus,
  Minus,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";


export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `${brand.name} — IA atende seu WhatsApp 24h e organiza o CRM sozinha` },
      {
        name: "description",
        content:
          "Conecte seu número de WhatsApp em 2 minutos. A IA do AtendAi responde, qualifica e move cada lead no funil automaticamente. 3 dias grátis, sem cartão.",
      },
      { property: "og:title", content: `${brand.name} — WhatsApp + IA + CRM no automático` },
      {
        property: "og:description",
        content: "Sua IA atende o WhatsApp 24h e organiza o CRM sozinha.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  async function cta(path: "/entrar" | "/demo/dashboard" | "#planos", plano: string = "atendai-semestral") {
    if (path === "#planos") {
      const el = document.getElementById("planos");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (path === "/entrar") {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          window.location.href = `/app/checkout?plano=${plano}`;
          return;
        }
      } catch {}
      window.location.href = `/entrar?modo=signup&plano=${plano}`;
      return;
    }
    window.location.href = path;
  }

  useScrollReveal();
  const { isDark, toggle } = useTheme();

  return (
    <div
      className={`lp-root ${isDark ? "is-dark" : "is-light"} min-h-screen w-full antialiased overflow-x-hidden`}
      style={{ fontFamily: "'Montserrat', system-ui, sans-serif" }}
    >
      {/* radial glows — absolute (não fixed) e mais leves no mobile pra fluidez */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1400px] z-0 overflow-hidden">
        <div
          className="lp-glow-a hidden md:block absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, #25D366 0%, transparent 60%)" }}
        />
        <div
          className="lp-glow-b hidden md:block absolute top-[20%] -right-40 h-[700px] w-[700px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 65%)" }}
        />
        <div
          className="lp-glow-c md:hidden absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[420px] rounded-full blur-2xl"
          style={{ background: "radial-gradient(circle, #25D366 0%, transparent 60%)" }}
        />
      </div>

      <div className="relative z-10">
        <Header onCta={cta} isDark={isDark} onToggleTheme={toggle} />
        <Hero onCta={cta} />
        <Stats />
        <Pain />
        <HowItWorks />
        <Features />
        <Pricing onCta={cta} />
        <Testimonials />
        <Faq />
        <FinalCta onCta={cta} />
        <Footer />
      </div>

      <style>{`
        html { scroll-behavior: smooth; }
        .lp-root { font-family: 'Montserrat', system-ui, sans-serif; }
        .font-display { font-family: 'Montserrat', system-ui, sans-serif; font-weight: 800; letter-spacing: -0.025em; }
        .font-brand { font-family: 'Montserrat', system-ui, sans-serif; font-weight: 900; letter-spacing: -0.04em; }
        .text-grad {
          background: linear-gradient(95deg, #25D366 0%, #a3e635 45%, #22d3ee 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .btn-glow {
          box-shadow: 0 10px 30px -12px rgba(37,211,102,0.55), 0 0 0 1px rgba(37,211,102,0.35) inset;
        }

        /* ===== LP tokens ===== */
        .lp-root.is-dark {
          --lp-bg: #04100A;
          --lp-fg-rgb: 255,255,255;
          --lp-fg-strong-rgb: 255,255,255;
          --lp-fg-inv: #0A1510;
          --lp-glass-bg: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
          --lp-glass-bd: rgba(255,255,255,0.10);
          --lp-glass-strong-bg: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03));
          --lp-glass-strong-bd: rgba(255,255,255,0.14);
          --lp-header-bg: rgba(4,16,10,0.55);
          --lp-header-bd: rgba(255,255,255,0.06);
          --lp-grid: rgba(255,255,255,0.04);
          --lp-bubble-left-bg: #1b2926;
          --lp-bubble-left-bd: rgba(255,255,255,0.05);
          --lp-bubble-left-fg: #FFFFFF;
          --lp-phone-shell: linear-gradient(180deg,#1a1f1d,#0b0f0d);
          --lp-phone-shell-bd: rgba(255,255,255,0.08);
          --lp-phone-screen: #0b1410;
          --lp-chat-header-bg: #111d18;
          --lp-chat-header-bd: rgba(255,255,255,0.05);
          --lp-input-bg: #111d18;
          --lp-input-pill: #0b1410;
          --lp-final-bg: linear-gradient(135deg,#0c3a23,#0a1a13);
          --lp-final-bd: rgba(37,211,102,0.30);
          --lp-final-shadow: 0 40px 120px -40px rgba(37,211,102,0.6);
        }
        .lp-root.is-light {
          --lp-bg: #F5F8F6;
          --lp-fg-rgb: 6,16,11;
          --lp-fg-strong-rgb: 0,0,0;
          --lp-fg-inv: #FFFFFF;
          --lp-glass-bg: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.78));
          --lp-glass-bd: rgba(10,21,16,0.12);
          --lp-glass-strong-bg: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.88));
          --lp-glass-strong-bd: rgba(10,21,16,0.16);
          --lp-header-bg: rgba(255,255,255,0.82);
          --lp-header-bd: rgba(10,21,16,0.10);
          --lp-grid: rgba(10,21,16,0.06);
          --lp-bubble-left-bg: #EEF3EF;
          --lp-bubble-left-bd: rgba(10,21,16,0.08);
          --lp-bubble-left-fg: #050D09;
          --lp-phone-shell: linear-gradient(180deg,#E2E8E4,#BFCAC3);
          --lp-phone-shell-bd: rgba(10,21,16,0.12);
          --lp-phone-screen: #F2F6F3;
          --lp-chat-header-bg: #FFFFFF;
          --lp-chat-header-bd: rgba(10,21,16,0.08);
          --lp-input-bg: #FFFFFF;
          --lp-input-pill: #EEF3EF;
          --lp-final-bg: linear-gradient(135deg,#E8F6EE,#FFFFFF);
          --lp-final-bd: rgba(22,163,74,0.30);
          --lp-final-shadow: 0 40px 120px -40px rgba(22,163,74,0.35);
        }

        .lp-root { background: var(--lp-bg); color: rgb(var(--lp-fg-strong-rgb)); }
        .lp-root .glass { background: var(--lp-glass-bg); border: 1px solid var(--lp-glass-bd); transition: border-color .35s ease, box-shadow .35s ease, transform .35s ease; }
        .lp-root .glass:hover { border-color: rgba(37,211,102,0.45); box-shadow: 0 14px 40px -18px rgba(37,211,102,0.35); }
        .lp-root .glass-strong { background: var(--lp-glass-strong-bg); border: 1px solid var(--lp-glass-strong-bd); transition: border-color .35s ease, box-shadow .35s ease, transform .35s ease; }
        .lp-root .glass-strong:hover { border-color: rgba(37,211,102,0.55); box-shadow: 0 18px 50px -18px rgba(37,211,102,0.45); }
        @media (min-width: 768px) {
          .lp-root .glass { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
          .lp-root .glass-strong { backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
        }
        .lp-root .grid-bg {
          background-image:
            linear-gradient(var(--lp-grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--lp-grid) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .lp-header { background: var(--lp-header-bg); border-bottom: 1px solid var(--lp-header-bd); }

        /* override hardcoded white text/bg utilities inside LP — use stronger ink in light */
        .lp-root .text-white { color: rgb(var(--lp-fg-strong-rgb)) !important; }
        .lp-root .text-white\\/90 { color: rgba(var(--lp-fg-rgb),0.95) !important; }
        .lp-root .text-white\\/85 { color: rgba(var(--lp-fg-rgb),0.92) !important; }
        .lp-root .text-white\\/80 { color: rgba(var(--lp-fg-rgb),0.88) !important; }
        .lp-root .text-white\\/70 { color: rgba(var(--lp-fg-rgb),0.78) !important; }
        .lp-root .text-white\\/65 { color: rgba(var(--lp-fg-rgb),0.74) !important; }
        .lp-root .text-white\\/60 { color: rgba(var(--lp-fg-rgb),0.70) !important; }
        .lp-root .text-white\\/55 { color: rgba(var(--lp-fg-rgb),0.65) !important; }
        .lp-root .text-white\\/50 { color: rgba(var(--lp-fg-rgb),0.60) !important; }
        .lp-root .text-white\\/45 { color: rgba(var(--lp-fg-rgb),0.55) !important; }
        .lp-root .text-white\\/40 { color: rgba(var(--lp-fg-rgb),0.50) !important; }
        .lp-root .text-white\\/30 { color: rgba(var(--lp-fg-rgb),0.40) !important; }
        .lp-root .text-white\\/10 { color: rgba(var(--lp-fg-rgb),0.15) !important; }
        .lp-root .bg-white\\/10 { background-color: rgba(var(--lp-fg-rgb),0.10) !important; }
        .lp-root .bg-white\\/5 { background-color: rgba(var(--lp-fg-rgb),0.05) !important; }
        .lp-root .hover\\:bg-white\\/10:hover { background-color: rgba(var(--lp-fg-rgb),0.10) !important; }
        .lp-root .hover\\:text-white:hover { color: rgb(var(--lp-fg-strong-rgb)) !important; }
        .lp-root .border-white\\/5 { border-color: rgba(var(--lp-fg-rgb),0.10) !important; }
        .lp-root .border-white\\/10 { border-color: rgba(var(--lp-fg-rgb),0.12) !important; }
        .lp-root .divide-white\\/10 > :where(*) { border-color: rgba(var(--lp-fg-rgb),0.12) !important; }
        .lp-root.is-light .lp-glow-a { opacity: .22; }
        .lp-root.is-light .lp-glow-b { opacity: .10; }
        .lp-root.is-light .lp-glow-c { opacity: .16; }
        .lp-root.is-dark .lp-glow-a { opacity: .40; }
        .lp-root.is-dark .lp-glow-b { opacity: .25; }
        .lp-root.is-dark .lp-glow-c { opacity: .30; }

        /* clickable safety — make sure CTA buttons aren't blocked by glow overlays */
        .lp-root button, .lp-root a { position: relative; z-index: 1; cursor: pointer; }

        .dot-pulse { position: relative; }
        .dot-pulse::after {
          content: '';
          position: absolute; inset: 0;
          border-radius: 9999px;
          background: #25D366;
          animation: dot-pulse 1.8s ease-out infinite;
          opacity: 0.6;
        }
        @keyframes dot-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          80%, 100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes float-y {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float { animation: float-y 6s ease-in-out infinite; will-change: transform; }
        @media (max-width: 640px) { .animate-float { animation: none; } }
        .reveal { opacity: 0; transform: translateY(18px); transition: opacity .7s ease, transform .7s ease; will-change: opacity, transform; }
        .reveal.in { opacity: 1; transform: translateY(0); }
        @keyframes border-sheen {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .border-sheen {
          position: relative;
        }
        .border-sheen::before {
          content: '';
          position: absolute; inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(120deg, transparent 30%, rgba(37,211,102,0.6) 50%, transparent 70%);
          background-size: 200% 100%;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: border-sheen 6s linear infinite;
          pointer-events: none;
          opacity: 0;
          transition: opacity .35s ease;
        }
        .border-sheen:hover::before { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
          .animate-float { animation: none; }
          .border-sheen::before { animation: none; }
        }
      `}</style>
    </div>
  );
}

/* ===================== HEADER ===================== */
function Header({
  onCta,
  isDark,
  onToggleTheme,
}: {
  onCta: (p: "/entrar" | "/demo/dashboard" | "#planos", plano?: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header className="lp-header sticky top-0 z-50 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-5 md:px-8 h-[4.5rem] md:h-20 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 md:h-11 md:w-11 place-items-center rounded-2xl btn-glow" style={{ background: "linear-gradient(135deg,#25D366,#16a34a)" }}>
            <Zap className="size-5 text-black" strokeWidth={2.6} />
          </span>
          <span className="font-brand text-[1.5rem] md:text-[1.7rem] leading-none">
            Atend<span className="text-grad">AI</span>
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-8 text-[15px] font-semibold text-white/70">
          <a href="#como" className="hover:text-white transition">Como funciona</a>
          <a href="#recursos" className="hover:text-white transition">Recursos</a>
          <a href="#planos" className="hover:text-white transition">Planos</a>
          <a href="#faq" className="hover:text-white transition">Dúvidas</a>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Alternar tema"
            title={isDark ? "Tema claro" : "Tema escuro"}
            className="size-10 grid place-items-center rounded-xl glass text-white/80 hover:text-white transition"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button onClick={() => onCta("/entrar")} className="hidden sm:inline text-[15px] font-semibold px-4 py-2.5 rounded-xl text-white/80 hover:text-white">
            Entrar
          </button>
          <button
            onClick={() => onCta("#planos")}
            className="text-[15px] font-bold px-5 py-3 rounded-xl text-black btn-glow"
            style={{ background: "linear-gradient(135deg,#25D366,#16a34a)" }}
          >
            Ver planos
          </button>
        </div>
      </div>
    </header>
  );
}


/* ===================== HERO ===================== */
function Hero({ onCta }: { onCta: (p: "/entrar" | "/demo/dashboard" | "#planos", plano?: string) => void }) {
  return (
    <section className="relative px-4 sm:px-6 md:px-8 pt-12 md:pt-28 pb-16 md:pb-24">
      <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] opacity-40 pointer-events-none" />
      <div className="mx-auto max-w-7xl grid lg:grid-cols-2 gap-10 md:gap-16 items-center relative">
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-2 text-[13px] px-3.5 py-1.5 rounded-full glass">
            <span className="relative inline-block size-2 rounded-full bg-[#25D366] dot-pulse" />
            <span className="text-white/80 font-semibold">WhatsApp + IA + CRM no automático</span>
          </div>

          <h1 className="font-display text-[clamp(3rem,10vw,7rem)] leading-[0.92] mt-6 tracking-tight font-black">
            Sua IA atende o WhatsApp <span className="text-grad">24h</span> e organiza o CRM <span className="text-grad">sozinha</span>.
          </h1>

          <p className="mt-6 text-[17px] sm:text-xl text-white/70 max-w-xl mx-auto lg:mx-0 leading-relaxed">
            Conecte seu número, treine o agente em uma tela e veja cada lead ser respondido na hora,
            qualificado e movido no funil — sem você levantar o dedo.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 justify-center lg:justify-start">
            <button
              onClick={() => onCta("#planos")}
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl text-black font-bold text-[16px] btn-glow"
              style={{ background: "linear-gradient(135deg,#25D366,#16a34a)" }}
            >
              Começar 3 dias grátis
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => onCta("/demo/dashboard")}
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl glass-strong text-white/90 hover:bg-white/10 transition text-[16px] font-semibold cursor-pointer"
            >
              <Play className="size-4" /> Ver demonstração
            </button>
          </div>

          <ul className="mt-7 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-white/65 font-medium">
            <li className="flex items-center gap-1.5"><Check className="size-4 text-[#25D366]" /> 3 dias grátis, sem cartão</li>
            <li className="flex items-center gap-1.5"><Check className="size-4 text-[#25D366]" /> Conecta em 2 minutos</li>
            <li className="flex items-center gap-1.5"><Check className="size-4 text-[#25D366]" /> Cancele quando quiser</li>
          </ul>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <PhoneMock />
        </div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <div className="relative animate-float">
      {/* glow */}
      <div
        className="absolute -inset-10 rounded-[3rem] blur-3xl opacity-60"
        style={{ background: "radial-gradient(circle, #25D366 0%, transparent 60%)" }}
      />
      {/* phone */}
      <div
        className="relative w-[270px] sm:w-[320px] md:w-[340px] h-[560px] sm:h-[620px] md:h-[640px] rounded-[2.5rem] p-3 shadow-2xl"
        style={{ background: "var(--lp-phone-shell)", border: "1px solid var(--lp-phone-shell-bd)" }}
      >
        <div
          className="relative w-full h-full rounded-[2rem] overflow-hidden flex flex-col"
          style={{ background: "var(--lp-phone-screen)" }}
        >
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[10px] text-white/60">
            <span>9:41</span>
            <span>●●● 5G</span>
          </div>
          {/* chat header */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--lp-chat-header-bg)", borderBottom: "1px solid var(--lp-chat-header-bd)" }}>
            <div className="grid place-items-center size-9 rounded-full text-black font-bold" style={{ background: "linear-gradient(135deg,#25D366,#16a34a)" }}>
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">AtendAi • IA</div>
              <div className="text-[10px] text-[#25D366] flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#25D366]" /> online agora
              </div>
            </div>
          </div>
          {/* messages */}
          <div className="flex-1 px-3 py-4 space-y-3 overflow-hidden">
            <Bubble side="left" delay="0s">Oi! Vi o anúncio do site. Vocês ainda têm vaga pra essa semana?</Bubble>
            <Bubble side="right" delay=".4s">Oi Marina, tudo bem? 👋 Temos sim! Pra qual serviço você tá pensando?</Bubble>
            <Bubble side="left" delay=".8s">Quero fazer design de sobrancelha + cílios</Bubble>
            <Bubble side="right" delay="1.2s">
              Perfeito 🤌 Tenho quinta 15h ou sexta 10h. Qual prefere?
            </Bubble>
            <div className="flex items-center gap-2 text-[10px] text-white/50 pl-2 reveal" style={{ animationDelay: "1.6s" }}>
              <Sparkles className="size-3 text-[#25D366]" />
              respondido pela IA em 3s
            </div>
          </div>
          {/* input */}
          <div className="px-3 py-3 flex items-center gap-2" style={{ background: "var(--lp-chat-header-bg)" }}>
            <div className="flex-1 h-9 rounded-full px-4 text-xs text-white/40 grid place-items-start content-center" style={{ background: "var(--lp-input-pill)" }}>
              Mensagem
            </div>
            <div className="size-9 rounded-full grid place-items-center" style={{ background: "#25D366" }}>
              <ArrowRight className="size-4 text-black" />
            </div>
          </div>
        </div>
      </div>


      {/* floating CRM card — escondido em telas muito pequenas pra não estourar */}
      <div className="hidden sm:block absolute -left-10 sm:-left-16 bottom-20 glass-strong rounded-2xl p-3.5 w-[220px] shadow-2xl animate-float" style={{ animationDelay: "1.5s" }}>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50 font-semibold">
          <KanbanSquare className="size-3 text-[#25D366]" />
          CRM atualizado
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="size-9 rounded-full grid place-items-center font-bold text-black" style={{ background: "#a3e635" }}>M</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Marina</div>
            <div className="text-[11px] text-white/55 truncate">8 pessoas → Negociando</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-2/3" style={{ background: "linear-gradient(90deg,#25D366,#a3e635)" }} />
        </div>
      </div>

      {/* floating badge top */}
      <div className="hidden sm:flex absolute -right-6 sm:-right-10 top-12 glass-strong rounded-xl px-3 py-2 items-center gap-2 shadow-2xl animate-float" style={{ animationDelay: "3s" }}>
        <span className="size-2 rounded-full bg-[#25D366] dot-pulse relative" />
        <span className="text-xs font-medium">Lead respondido</span>
      </div>
    </div>
  );
}

function Bubble({ children, side, delay }: { children: React.ReactNode; side: "left" | "right"; delay: string }) {
  const isRight = side === "right";
  return (
    <div
      className={`reveal flex ${isRight ? "justify-end" : "justify-start"}`}
      style={{ transitionDelay: delay, animationDelay: delay }}
      data-reveal
    >
      <div
        className={`max-w-[78%] px-3 py-2 text-[13px] leading-snug rounded-2xl ${isRight ? "rounded-br-sm text-black" : "rounded-bl-sm"}`}
        style={
          isRight
            ? { background: "linear-gradient(135deg,#25D366,#16a34a)", boxShadow: "0 8px 24px -8px rgba(37,211,102,0.5)" }
            : { background: "var(--lp-bubble-left-bg)", border: "1px solid var(--lp-bubble-left-bd)", color: "var(--lp-bubble-left-fg)" }
        }
      >

        {children}
      </div>
    </div>
  );
}

/* ===================== STATS ===================== */
function Stats() {
  const items = [
    { n: "3s", l: "tempo de resposta" },
    { n: "24/7", l: "no ar" },
    { n: "+38%", l: "conversão" },
    { n: "0", l: "lead esquecido" },
  ];
  return (
    <section className="px-5 md:px-8 py-12 md:py-16">
      <div className="mx-auto max-w-6xl glass rounded-3xl grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10 reveal" data-reveal>
        {items.map((it) => (
          <div key={it.l} className="px-6 py-8 text-center">
            <div className="font-display text-4xl md:text-5xl text-grad">{it.n}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/55 mt-2 font-semibold">{it.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ===================== PAIN ===================== */
function Pain() {
  return (
    <section className="px-5 md:px-8 py-24 md:py-28">
      <div className="mx-auto max-w-3xl text-center reveal" data-reveal>
        <h2 className="font-display text-4xl md:text-6xl leading-[1.02] tracking-tight">
          Lead que espera, lead que <span className="text-grad">compra do concorrente</span>.
        </h2>
        <p className="mt-6 text-lg md:text-xl text-white/65 leading-relaxed">
          A primeira empresa a responder vende. Sempre. Enquanto você está dirigindo, atendendo na loja
          ou dormindo, os leads do anúncio que você pagou estão sumindo na fila. O AtendAi responde
          em segundos, qualifica e já te entrega o lead pronto pra fechar.
        </p>
      </div>
    </section>
  );
}

/* ===================== HOW IT WORKS ===================== */
function HowItWorks() {
  const steps = [
    { n: "01", t: "Informe os dados da empresa", d: "Cadastre as informações, serviços, horários e regras do negócio.", icon: <Users className="size-5" /> },
    { n: "02", t: "Configure o atendente", d: "Defina como a IA deve atender, qualificar, vender e quando transferir para uma pessoa.", icon: <Bot className="size-5" /> },
    { n: "03", t: "Teste o atendimento", d: "Converse com o atendente antes de colocá-lo em funcionamento.", icon: <Play className="size-5" /> },
    { n: "04", t: "Conecte o WhatsApp", d: "Faça a conexão seguindo as instruções exibidas na plataforma.", icon: <MessageSquareText className="size-5" /> },
    { n: "05", t: "Comece a atender", d: "O AtendAi começa a atender, organizar os contatos e atualizar o CRM.", icon: <KanbanSquare className="size-5" /> },
  ];
  return (
    <section id="como" className="px-5 md:px-8 py-24 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Como funciona" title={<>Em 5 passos, <span className="text-grad">você mesmo configura</span>.</>} />
        <p className="text-center text-white/55 max-w-2xl mx-auto mt-4 text-[15px]">Configure o AtendAi seguindo o passo a passo da própria plataforma. Se preferir, você também pode contratar nossa equipe para realizar a implementação — serviço opcional, cobrado à parte e não incluído na assinatura.</p>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {steps.map((s) => (
            <div key={s.n} className="glass border-sheen rounded-2xl p-7 relative reveal" data-reveal>
              <div className="font-display text-5xl text-white/10 absolute right-5 top-4">{s.n}</div>
              <div className="size-11 rounded-xl grid place-items-center" style={{ background: "rgba(37,211,102,0.15)", color: "#25D366" }}>
                {s.icon}
              </div>
              <h3 className="font-display text-xl mt-4">{s.t}</h3>
              <p className="text-white/65 text-sm mt-2 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== FEATURES ===================== */
function Features() {
  const items = [
    { t: "IA incluída que atende e vende", d: "Atendimento inicial, qualificação de contatos, apoio em vendas e apresentação de produtos e serviços.", icon: <Bot className="size-5" /> },
    { t: "Multiagentes", d: "Vários atendentes de IA, cada um com seu papel, dentro da mesma empresa.", icon: <Sparkles className="size-5" /> },
    { t: "Agenda completa", d: "Agendamento, reagendamento, cancelamento e lembretes automáticos.", icon: <LineChart className="size-5" /> },
    { t: "Follow-up e campanhas", d: "Retome contatos que pararam de responder e envie campanhas para quem autorizou.", icon: <PauseCircle className="size-5" /> },
    { t: "CRM com funil", d: "A IA move os cards no funil conforme o atendimento avança.", icon: <KanbanSquare className="size-5" /> },
    { t: "Caixa de entrada da equipe", d: "Transferência para setor ou atendente humano, com resumo da conversa.", icon: <MessageSquareText className="size-5" /> },
  ];
  return (
    <section id="recursos" className="px-5 md:px-8 py-24 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Recursos" title={<>Tudo que você precisa pra <span className="text-grad">parar de perder venda</span>.</>} />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it) => (
            <div key={it.t} className="glass border-sheen rounded-2xl p-6 hover:-translate-y-1 transition-transform reveal" data-reveal>
              <div className="size-11 rounded-xl grid place-items-center" style={{ background: "rgba(37,211,102,0.15)", color: "#25D366" }}>
                {it.icon}
              </div>
              <h3 className="font-display text-lg mt-4">{it.t}</h3>
              <p className="text-white/65 text-sm mt-2 leading-relaxed">{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== PRICING ===================== */
function Pricing({ onCta }: { onCta: (p: "/entrar" | "/demo/dashboard" | "#planos", plano?: string) => void }) {
  const [periodos, setPeriodos] = useState<AtendaiPeriodo[]>([]);
  const [sel, setSel] = useState<string>(DEFAULT_PERIODO_SLUG);
  useEffect(() => { fetchAtendaiPeriodos().then(setPeriodos).catch(() => setPeriodos([])); }, []);
  const atual = periodos.find((p) => p.slug === sel) ?? periodos[0];
  const inclui = [
    "IA incluída",
    "Multiagentes",
    atual ? `${atual.limite_mensagens.toLocaleString("pt-BR")} mensagens enviadas por mês` : "Mensagens enviadas por mês",
    atual ? `${atual.limite_usuarios} usuários no painel` : "Usuários no painel",
    atual ? `${atual.limite_contatos.toLocaleString("pt-BR")} contatos` : "Contatos",
    "Agendamento, reagendamento, cancelamento e lembretes",
    "Follow-up e campanhas",
    "CRM com funil e caixa de entrada da equipe",
    "Transferência para setor ou atendente humano",
  ];
  return (
    <section id="planos" className="px-5 md:px-8 py-24 md:py-28">
      <div className="mx-auto max-w-4xl">
        <SectionTitle eyebrow="Plano AtendAi" title={<>Um plano. <span className="text-grad">Tudo incluído</span>.</>} />
        <p className="text-center text-white/55 max-w-2xl mx-auto mt-4 text-[15px]">Todas as funcionalidades estão incluídas. O que muda é somente o período contratado.</p>
        <div className="mt-10 rounded-2xl p-7 glass-strong reveal" data-reveal style={{ boxShadow: "0 20px 60px -20px rgba(37,211,102,0.5), 0 0 0 1px rgba(37,211,102,0.4) inset" }}>
          <div className="text-center text-[11px] uppercase tracking-wider text-white/50 font-semibold">Preço promocional</div>
          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            {periodos.map((p) => {
              const on = p.slug === atual?.slug;
              return (
                <button key={p.id} onClick={() => setSel(p.slug)} className={`relative rounded-xl p-4 text-left transition ${on ? "glass-strong" : "glass hover:bg-white/5"}`} style={on ? { boxShadow: "0 0 0 2px #25D366 inset" } : undefined}>
                  {p.destaque && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full text-black whitespace-nowrap" style={{ background: "linear-gradient(135deg,#25D366,#a3e635)" }}>Melhor condição</div>
                  )}
                  <div className="text-sm text-white/60 font-semibold uppercase tracking-wider">{p.nome}</div>
                  <div className="font-display text-3xl mt-1">{formatBRL(p.preco_cents)}</div>
                  <p className="text-xs text-white/55 mt-1">{periodoResumo(p)}</p>
                </button>
              );
            })}
          </div>
          <ul className="mt-7 grid sm:grid-cols-2 gap-2.5 text-sm">
            {inclui.map((x) => (
              <li key={x} className="flex gap-2.5">
                <span className="mt-0.5 size-4 rounded-full grid place-items-center shrink-0" style={{ background: "rgba(37,211,102,0.2)" }}>
                  <Check className="size-2.5 text-[#25D366]" strokeWidth={3} />
                </span>
                <span className="text-white/80">{x}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => onCta("/entrar", atual?.slug ?? DEFAULT_PERIODO_SLUG)} className="mt-7 w-full px-4 py-3 rounded-xl font-semibold transition text-black btn-glow" style={{ background: "linear-gradient(135deg,#25D366,#16a34a)" }}>
            Começar 3 dias grátis
          </button>
          <p className="mt-2 text-center text-xs text-white/55">3 dias grátis, sem cartão.</p>
        </div>
        <p className="mt-5 text-center text-xs text-white/40">Limite de mensagens renovado todo mês em qualquer período. Implementação pela nossa equipe é opcional e cobrada à parte.</p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-7 flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl md:text-2xl font-bold">Sua operação precisa de algo mais completo?</h3>
            <p className="mt-2 text-sm text-white/70">Se sua empresa possui mais de um número de WhatsApp, filiais, equipes maiores, diferentes setores ou processos específicos, podemos montar uma solução personalizada para sua operação.</p>
            <p className="mt-2 text-sm text-white/60">Nossa equipe analisa seu atendimento, estrutura os fluxos, configura os agentes e realiza a implementação completa.</p>
          </div>
          <div className="w-full md:w-auto md:shrink-0 text-center">
            <a
              href={`${supportWhatsappUrl}?text=${encodeURIComponent("Olá! Minha empresa possui uma operação maior e quero conhecer a solução personalizada.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full md:w-auto px-5 py-3 rounded-xl font-semibold transition border border-[#25D366]/50 text-[#25D366] hover:bg-[#25D366]/10"
            >
              Quero uma solução personalizada
            </a>
            <p className="mt-2 text-xs text-white/55">Fale com um especialista para analisar sua operação.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== TESTIMONIALS ===================== */
function Testimonials() {
  const items = [
    {
      n: "Camila — Studio de Estética",
      t: "Eu atendia entre clientes e perdia muita agenda. Agora a IA marca sozinha. Faturei 32% a mais no segundo mês.",
    },
    {
      n: "Rafael — Loja de Suplementos",
      t: "A galera me chamava no WhatsApp 1h da manhã. Hoje todo mundo é respondido na hora. CRM organizado sem eu tocar.",
    },
    {
      n: "Marina — Agência de Marketing",
      t: "Tirei o lead frio do operacional do time. A IA filtra e só passa quem é quente. Salvou minha sanidade.",
    },
  ];
  return (
    <section className="px-5 md:px-8 py-24 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Quem usa" title={<>Times que pararam de perder venda <span className="text-grad">no 'oi, sumiu'</span>.</>} />
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {items.map((it) => (
            <div key={it.n} className="glass border-sheen rounded-2xl p-6 reveal" data-reveal>
              <div className="flex gap-1 text-[#facc15]">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="size-4 fill-current" />)}
              </div>
              <p className="text-white/85 mt-4 leading-relaxed text-[15px]">"{it.t}"</p>
              <div className="mt-5 text-sm text-white/55">{it.n}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== FAQ ===================== */
function Faq() {
  const items = [
    {
      q: "Preciso saber programar?",
      a: "Não. Você conecta o WhatsApp por QR Code, preenche uma tela contando sobre sua empresa, e a IA já tá atendendo. Quem sabe usar WhatsApp consegue.",
    },
    {
      q: "Funciona com vários atendentes?",
      a: "Funciona. Você convida sua equipe, cada um com seu acesso. A IA atende o que dá pra atender; o que precisa de humano, o time assume.",
    },
    {
      q: "A IA responde igual um robô?",
      a: "Não. Ela é treinada pra falar como gente — mensagens curtas, uma pergunta por vez, no tom da sua empresa. Em testes cegos, cliente nem percebe.",
    },
    {
      q: "Meu número fica seguro?",
      a: "Sim. Cada empresa tem ambiente isolado, dados criptografados e você é dono da conversa. Você pode desconectar a qualquer momento.",
    },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="px-5 md:px-8 py-24 md:py-28">
      <div className="mx-auto max-w-3xl">
        <SectionTitle eyebrow="Dúvidas" title={<>Antes de você perguntar.</>} />
        <div className="mt-10 space-y-3">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={it.q} className="glass border-sheen rounded-2xl overflow-hidden reveal" data-reveal>
                <button onClick={() => setOpen(isOpen ? null : i)} className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left">
                  <span className="font-semibold">{it.q}</span>
                  <span className="size-7 grid place-items-center rounded-full shrink-0" style={{ background: "rgba(37,211,102,0.15)", color: "#25D366" }}>
                    {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
                  </span>
                </button>
                {isOpen && <div className="px-5 pb-5 text-white/70 text-sm leading-relaxed">{it.a}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ===================== FINAL CTA ===================== */
function FinalCta({ onCta }: { onCta: (p: "/entrar" | "/demo/dashboard" | "#planos", plano?: string) => void }) {
  return (
    <section className="px-4 sm:px-5 md:px-8 py-20 md:py-28">
      <div
        className="mx-auto max-w-6xl rounded-[2rem] p-8 sm:p-12 md:p-20 text-center relative overflow-hidden reveal"
        data-reveal
        style={{
          background: "var(--lp-final-bg)",
          border: "1px solid var(--lp-final-bd)",
          boxShadow: "var(--lp-final-shadow)",
        }}
      >

        <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-[500px] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle,#25D366,transparent 60%)" }} />
        <div className="relative">
          <h2 className="font-display text-4xl sm:text-5xl md:text-7xl leading-[0.98] tracking-tight">
            Pare de perder venda no <span className="text-grad">"oi, sumiu"</span>.
          </h2>
          <p className="mt-6 text-white/70 max-w-xl mx-auto text-lg sm:text-xl">
            3 dias grátis pra ver a IA atendendo seu WhatsApp e fechando lead sozinha. Sem cartão.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <button
              onClick={() => onCta("/entrar")}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-black font-bold text-base sm:text-lg btn-glow"
              style={{ background: "linear-gradient(135deg,#25D366,#16a34a)" }}
            >
              Começar 3 dias grátis <ArrowRight className="size-5" />
            </button>
            <button onClick={() => onCta("/demo/dashboard")} className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl glass-strong text-white hover:bg-white/10 text-base sm:text-lg font-medium">
              <Play className="size-4" /> Ver demonstração
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== FOOTER ===================== */
function Footer() {
  return (
    <footer className="px-5 md:px-8 pt-16 md:pt-20 pb-10 border-t border-white/5">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl btn-glow" style={{ background: "linear-gradient(135deg,#25D366,#16a34a)" }}>
                <Zap className="size-4 text-black" strokeWidth={2.6} />
              </span>
              <span className="font-brand text-[1.4rem] leading-none">Atend<span className="text-grad">AI</span></span>
            </div>
            <p className="mt-4 text-sm text-white/55 leading-relaxed max-w-xs">
              IA que atende seu WhatsApp 24h, qualifica e organiza o CRM sozinha. Você só fecha.
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/45 font-bold">Produto</div>
            <ul className="mt-4 space-y-2.5 text-sm text-white/65">
              <li><a href="#recursos" className="hover:text-white">Recursos</a></li>
              <li><a href="#como" className="hover:text-white">Como funciona</a></li>
              <li><a href="#planos" className="hover:text-white">Planos</a></li>
              <li><a href="/demo/dashboard" className="hover:text-white">Demonstração</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/45 font-bold">Empresa</div>
            <ul className="mt-4 space-y-2.5 text-sm text-white/65">
              <li><a href="#faq" className="hover:text-white">Dúvidas</a></li>
              <li><a href="#" className="hover:text-white">Contato</a></li>
              <li><a href="#" className="hover:text-white">Suporte</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/45 font-bold">Legal</div>
            <ul className="mt-4 space-y-2.5 text-sm text-white/65">
              <li><a href="/termos" className="hover:text-white">Termos</a></li>
              <li><a href="/privacidade" className="hover:text-white">Privacidade</a></li>
              <li><a href="/reembolso" className="hover:text-white">Reembolso</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col md:flex-row gap-3 items-center justify-between text-xs text-white/40">
          <span>© {new Date().getFullYear()} {brand.name}. Todos os direitos reservados.</span>
          <span>Feito no Brasil com ☕ e WhatsApp.</span>
        </div>
      </div>
    </footer>
  );
}

/* ===================== HELPERS ===================== */
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: React.ReactNode; center?: boolean }) {
  // Padronizado: sempre centralizado, maior, com eyebrow em destaque.
  return (
    <div className="reveal text-center" data-reveal>
      <div className="inline-flex items-center justify-center gap-3 text-[11px] uppercase tracking-[0.28em] text-[#25D366] font-bold">
        <span className="h-px w-10 bg-[#25D366]/60" />
        {eyebrow}
        <span className="h-px w-10 bg-[#25D366]/60" />
      </div>
      <h2 className="font-display text-5xl md:text-7xl font-black leading-[0.98] tracking-tight mt-5 max-w-4xl mx-auto">
        {title}
      </h2>
    </div>
  );
}

function useScrollReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -10% 0px" },
    );
    // single pass — todos os elementos já estão no markup ao montar
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      el.classList.add("reveal");
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
}

function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !isDark;
    setIsDark(next);
    const root = document.documentElement;
    if (next) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }
  return { isDark, toggle };
}

export const _unused = redirect;

