import { AlertTriangle } from "lucide-react";
import { trialDaysLeft, type CompanyRow } from "@/lib/tenant";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n";

export function TrialBanner({ company }: { company: CompanyRow }) {
  const t = useT();
  if (company.status_cobranca !== "trial") return null;
  const days = trialDaysLeft(company.trial_ate);

  return (
    <div className="px-4 py-2.5 text-sm flex items-center justify-center gap-2 bg-red-600 text-white border-b border-red-700 font-medium">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{days > 0 ? t("trial.ativo", { dias: days }) : t("trial.expirado")}</span>
      <Link
        to="/app/checkout"
        className="ml-2 inline-flex items-center rounded-md bg-white/15 hover:bg-white/25 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/30"
      >
        {t("trial.verPlanos")}
      </Link>
    </div>
  );
}
