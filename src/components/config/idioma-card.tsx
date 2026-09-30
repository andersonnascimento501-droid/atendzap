import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale, useT, type Locale } from "@/i18n";

/** Preferência de idioma do usuário — salva em profiles.idioma (vale em qualquer dispositivo). */
export function IdiomaCard({ userId, companyId, companyIdioma, canEditCompany }: { userId: string; companyId?: string; companyIdioma?: string | null; canEditCompany?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function change(v: string) {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ idioma: v as Locale }).eq("user_id", userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("idioma.salvo"));
    await router.invalidate();
  }

  async function changeCompany(v: string) {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase.from("company").update({ idioma_padrao: v } as any).eq("id", companyId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("idioma.salvo"));
    await router.invalidate();
  }

  return (
    <Card className="p-5 space-y-2 max-w-xl">
      <Label>{t("idioma.titulo")}</Label>
      <p className="text-xs text-muted-foreground">{t("idioma.descricao")}</p>
      <Select value={locale} onValueChange={change} disabled={saving}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pt-BR">{t("idioma.pt")}</SelectItem>
          <SelectItem value="es-ES">{t("idioma.es")}</SelectItem>
        </SelectContent>
      </Select>
      {canEditCompany && companyId && (
        <div className="space-y-1.5 pt-2">
          <Label>{t("idioma.empresa")}</Label>
          <p className="text-xs text-muted-foreground">{t("idioma.empresaDesc")}</p>
          <Select value={companyIdioma || "pt-BR"} onValueChange={changeCompany} disabled={saving}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pt-BR">{t("idioma.pt")}</SelectItem>
              <SelectItem value="es-ES">{t("idioma.es")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </Card>
  );
}
