import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";
import { LANDING } from "@/i18n/landing";
import { fillDays, DEFAULT_TRIAL_DAYS } from "@/lib/atendai-plan";

const c = fillDays(LANDING["es-ES"], DEFAULT_TRIAL_DAYS);

export const Route = createFileRoute("/es")({
  ssr: false,
  head: () => ({
    meta: [
      { title: c.metaTitle },
      { name: "description", content: c.metaDesc },
      { property: "og:title", content: c.ogTitle },
      { property: "og:description", content: c.ogDesc },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "es_ES" },
      { property: "og:url", content: "https://app.atendai.tech/es" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://app.atendai.tech/es" },
      { rel: "alternate", hrefLang: "pt-BR", href: "https://app.atendai.tech/" },
    ],
  }),
  component: () => <LandingPage locale="es-ES" />,
});
