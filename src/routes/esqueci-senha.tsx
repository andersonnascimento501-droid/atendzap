import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { translate, type TKey } from "@/i18n";
import { getPublicLocale } from "@/i18n/public";

const t = (k: TKey) => translate(getPublicLocale(), k);

export const Route = createFileRoute("/esqueci-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: `${brand.name} — Recuperar senha / Recuperar contraseña` }] }),
  component: Page,
});

function Page() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-senha`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("senha.linkEnviado"));
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold mb-1">{t("senha.recuperarTitulo")}</h1>
        <p className="text-sm text-muted-foreground mb-4">{t("senha.recuperarDesc")}</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("auth.email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? t("senha.enviando") : t("senha.enviarLink")}</Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <Link to="/entrar" className="text-muted-foreground hover:underline">{t("senha.voltarLogin")}</Link>
        </div>
      </Card>
    </div>
  );
}
