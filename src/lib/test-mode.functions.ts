import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTestPhone } from "./test-mode";

async function ownCompany(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error || !data?.company_id) throw new Error("Empresa não encontrada");
  return data.company_id as string;
}

export const getTestMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await ownCompany(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("company")
      .select("agent_test_mode, agent_test_phone, agent_tested_at")
      .eq("id", companyId)
      .maybeSingle();
    return {
      active: !!data?.agent_test_mode,
      phone: (data?.agent_test_phone as string | null) ?? null,
      testedAt: (data?.agent_tested_at as string | null) ?? null,
    };
  });

/** action: "activate" (salva número e ativa) | "deactivate" | "release" (libera para todos). */
export const setTestMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { action: "activate" | "deactivate" | "release"; phone?: string }) => {
    if (!["activate", "deactivate", "release"].includes(i?.action)) throw new Error("Ação inválida");
    return { action: i.action, phone: String(i.phone ?? "").slice(0, 40) };
  })
  .handler(async ({ data, context }) => {
    const companyId = await ownCompany(context.supabase, context.userId);
    const patch: Record<string, any> = {};
    if (data.action === "activate") {
      const phone = normalizeTestPhone(data.phone);
      if (!phone) throw new Error("Número inválido. Informe com DDD, ex.: (11) 99999-9999");
      patch.agent_test_phone = phone;
      patch.agent_test_mode = true;
    } else {
      patch.agent_test_mode = false; // número fica salvo como referência
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("company").update(patch).eq("id", companyId);
    if (error) throw new Error("Não foi possível salvar");
    return { ok: true, active: !!patch.agent_test_mode, phone: patch.agent_test_phone ?? null };
  });
