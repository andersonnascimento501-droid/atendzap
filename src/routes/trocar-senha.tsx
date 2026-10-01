import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/trocar-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: `${brand.name} — Trocar senha` }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/entrar", replace: true });
      else setUserId(data.user.id);
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) return toast.error(t("senha.minimo"));
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) { setLoading(false); return toast.error(error.message); }
    // limpa flag forcar_troca_senha em todas as memberships do usuário
    if (userId) {
      await supabase.from("company_user").update({ forcar_troca_senha: false }).eq("user_id", userId);
    }
    setLoading(false);
    toast.success(t("senha.atualizada"));
    navigate({ to: "/app/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold mb-1">{t("senha.trocarTitulo")}</h1>
        <p className="text-sm text-muted-foreground mb-4">{t("senha.trocarDesc")}</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("senha.nova")}</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? t("senha.salvando") : t("senha.atualizar")}</Button>
        </form>
      </Card>
    </div>
  );
}
