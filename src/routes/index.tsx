import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";
import { LANDING } from "@/i18n/landing";
import { fillDays, DEFAULT_TRIAL_DAYS } from "@/lib/atendai-plan";

const c = fillDays(LANDING["pt-BR"], DEFAULT_TRIAL_DAYS);

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: c.metaTitle },
      { name: "description", content: c.metaDesc },
      { property: "og:title", content: c.ogTitle },
      { property: "og:description", content: c.ogDesc },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://app.atendai.tech/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://app.atendai.tech/" },
      { rel: "alternate", hrefLang: "es-ES", href: "https://app.atendai.tech/es" },
    ],
  }),
  component: () => <LandingPage locale="pt-BR" />,
});
