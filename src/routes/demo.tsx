import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import {
  Sparkles, LayoutDashboard, Inbox, KanbanSquare, Bot, Zap, LogIn,
  Contact, BarChart3, Smartphone, Users, Settings, Megaphone, Plug, Wallet, CalendarDays,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileBottomNav, type MobileNavItem } from "@/components/mobile-bottom-nav";
import { translate, type TKey } from "@/i18n";
import { usePublicLocale } from "@/i18n/public";

export const Route = createFileRoute("/demo")({
  component: DemoLayout,
});

const sectionsDef: { label: TKey; items: { to: string; label: TKey; icon: any; tag?: string }[] }[] = [
  {
    label: "demo.atendimento",
    items: [
      { to: "/demo/dashboard", label: "demo.dashboard", icon: LayoutDashboard },
      { to: "/demo/conversas", label: "demo.conversas", icon: Inbox },
      { to: "/demo/crm", label: "demo.crmKanban", icon: KanbanSquare },
      { to: "/demo/agenda", label: "demo.agenda", icon: CalendarDays },
      { to: "/demo/agente", label: "demo.agente", icon: Bot },
    ],
  },
  {
    label: "demo.crescimento",
    items: [
      { to: "/demo/campanhas", label: "demo.campanhas", icon: Megaphone },
      { to: "/demo/relatorios", label: "demo.relatorios", icon: BarChart3 },
      { to: "/demo/integracoes", label: "demo.integracoes", icon: Plug },
    ],
  },
  {
    label: "demo.gestao",
    items: [
      { to: "/demo/contatos", label: "demo.contatos", icon: Contact },
      { to: "/demo/financeiro", label: "demo.financeiro", icon: Wallet },
      { to: "/demo/conexao", label: "demo.conexao", icon: Smartphone },
      { to: "/demo/equipe", label: "demo.equipe", icon: Users },
      { to: "/demo/configuracoes", label: "demo.configuracoes", icon: Settings },
    ],
  },
];

const PRIMARY = "var(--brand)";

const mobileDef: { to: string; label: TKey; icon: any }[] = [
  { to: "/demo/dashboard", label: "demo.inicio", icon: LayoutDashboard },
  { to: "/demo/conversas", label: "demo.conversas", icon: Inbox },
  { to: "/demo/crm", label: "demo.crmKanban", icon: KanbanSquare },
  { to: "/demo/campanhas", label: "demo.campanhas", icon: Megaphone },
  { to: "/demo/agente", label: "demo.agenteCurto", icon: Bot },
];

function DemoLayout() {
  const loc = useLocation();
  const locale = usePublicLocale();
  const t = (k: TKey) => translate(locale, k);
  const sections = sectionsDef.map((sec) => ({ label: t(sec.label), items: sec.items.map((i) => ({ ...i, label: t(i.label) })) }));
  const mobileItems: MobileNavItem[] = mobileDef.map((i) => ({ ...i, label: i.label === "demo.crmKanban" ? "CRM" : t(i.label) }));
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-[color:var(--hairline)] bg-[color:var(--panel)]/85 backdrop-blur-xl px-4 py-2.5 text-[12.5px] md:text-[13.5px] flex items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-[color:var(--brand)] shrink-0" />
          <span className="truncate">
            <b className="text-gradient-brand font-display font-bold">{t("demo.modo")}</b>
            <span className="hidden sm:inline">{t("demo.aviso")}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <Link to="/entrar" className="text-[12.5px] md:text-sm font-semibold px-3 py-1.5 rounded-md bg-gradient-brand text-primary-foreground hover:opacity-90 whitespace-nowrap">
            {t("demo.comecar")}
          </Link>
          <span className="hidden sm:inline text-[11.5px] text-muted-foreground">{t("demo.semCartao")}</span>
        </div>
      </header>

      {/* Mobile brand bar */}
      <div className="md:hidden flex items-center gap-2.5 px-4 py-3 border-b border-[color:var(--hairline)]">
        <div
          className="size-8 rounded-lg grid place-items-center text-primary-foreground shrink-0"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, var(--brand-strong))` }}
        >
          <Zap className="size-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold tracking-tight text-[14.5px] leading-none truncate">{brand.name}</div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground truncate mt-0.5">Demo · {t("demo.clinica")}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="hidden md:flex w-[260px] min-h-screen border-r border-[color:var(--hairline)] bg-[color:var(--sidebar-bg)] flex-col">
          <div className="px-5 py-5 flex items-center gap-3 border-b border-[color:var(--hairline)]">
            <div
              className="size-10 rounded-xl grid place-items-center text-primary-foreground shadow-md ring-1 ring-[color:var(--hairline)]"
              style={{ background: `linear-gradient(135deg, ${PRIMARY}, var(--brand-strong))` }}
            >
              <Zap className="size-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="font-display font-extrabold tracking-tight truncate text-[16px]">{brand.name}</div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground truncate -mt-0.5">DEMO · Clínica Vitalis</div>
            </div>
          </div>

          <nav className="p-3 flex-1 overflow-y-auto space-y-5">
            {sections.map((sec) => (
              <div key={sec.label}>
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                  {sec.label}
                </div>
                <div className="flex flex-col gap-1">
                  {sec.items.map((it) => {
                    const active = loc.pathname === it.to;
                    const Icon = it.icon;
                    return (
                      <Link
                        key={it.to}
                        to={it.to}
                        className={`relative flex items-center gap-3 px-3 py-[11px] rounded-lg text-[14.5px] font-medium whitespace-nowrap transition-all ${
                          active ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[color:var(--panel-2)]"
                        }`}
                        style={
                          active
                            ? {
                                background: "var(--brand-soft)",
                                boxShadow: `inset 0 0 0 1px var(--brand-soft-strong), 0 0 22px -10px ${PRIMARY}`,
                              }
                            : undefined
                        }
                      >
                        {active && (
                          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: PRIMARY, boxShadow: `0 0 12px ${PRIMARY}` }} />
                        )}
                        <Icon className="size-[18px] shrink-0" style={active ? { color: PRIMARY } : undefined} />
                        <span className="flex-1 truncate">{it.label}</span>
                        {it.tag && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded ring-1"
                            style={{ background: "var(--brand-soft)", color: "var(--brand-text)", borderColor: "var(--brand-soft-strong)" }}
                          >
                            {it.tag}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-[color:var(--hairline)]">
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-[color:var(--panel-2)] border border-[color:var(--hairline)]">
              <div
                className="size-9 rounded-full grid place-items-center text-[13px] font-bold text-[color:var(--brand-text)] ring-1 ring-[color:var(--hairline-strong)] shrink-0"
                style={{ background: "var(--brand-soft)" }}
              >
                V
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold truncate">{t("demo.visitante")}</div>
                <div className="text-[11px] text-muted-foreground truncate">{t("demo.modo")}</div>
              </div>
              <Link to="/entrar" title="Entrar" className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[color:var(--panel)]">
                <LogIn className="size-4" />
              </Link>
            </div>
          </div>
        </aside>
        <main className="flex-1 px-4 pt-4 pb-28 md:p-8 md:pb-8 max-w-7xl w-full mx-auto"><Outlet /></main>
      </div>

      <MobileBottomNav items={mobileItems} accent="var(--brand)" />
    </div>
  );
}
