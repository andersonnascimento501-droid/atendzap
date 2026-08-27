create table if not exists public.instagram_integration (
  company_id uuid primary key references public.company(id) on delete cascade,
  user_id uuid,
  ig_user_id text,
  page_id text,
  page_name text,
  username text,
  page_access_token text,
  verify_token text not null default replace(gen_random_uuid()::text, '-', ''),
  conectado boolean not null default false,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.instagram_integration to authenticated;
grant all on public.instagram_integration to service_role;

alter table public.instagram_integration enable row level security;

drop policy if exists "instagram_integration tenant" on public.instagram_integration;
create policy "instagram_integration tenant"
  on public.instagram_integration for all to authenticated
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

create unique index if not exists instagram_integration_ig_user_uniq
  on public.instagram_integration (ig_user_id) where ig_user_id is not null;
create index if not exists instagram_integration_page_idx
  on public.instagram_integration (page_id);

drop trigger if exists tg_instagram_integration_updated_at on public.instagram_integration;
create trigger tg_instagram_integration_updated_at
  before update on public.instagram_integration
  for each row execute function public.tg_set_updated_at();

alter table public.mensagens add column if not exists channel text not null default 'whatsapp';
alter table public.crm_cards add column if not exists channel text not null default 'whatsapp';
create index if not exists mensagens_channel_idx on public.mensagens (company_id, channel, created_at desc);