-- Orçamento 2026 — banco no Supabase
-- Cole este arquivo inteiro em: Supabase › seu projeto › SQL Editor › New query › Run.
--
-- Cada registro do app é um "documento" JSON (categorias, orçamentos do mês,
-- histórico, lançamentos, metas, aportes, configuração), sempre preso ao
-- usuário logado. A política de segurança (RLS) garante que cada pessoa só lê
-- e escreve os próprios dados — mesmo que alguém pegue o link do site.

create table if not exists public.docs (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  colecao       text        not null,
  doc_id        text        not null,
  dados         jsonb       not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, colecao, doc_id)
);

alter table public.docs enable row level security;

drop policy if exists "dono lê"      on public.docs;
drop policy if exists "dono cria"    on public.docs;
drop policy if exists "dono altera"  on public.docs;
drop policy if exists "dono apaga"   on public.docs;

create policy "dono lê"     on public.docs for select using (auth.uid() = user_id);
create policy "dono cria"   on public.docs for insert with check (auth.uid() = user_id);
create policy "dono altera" on public.docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dono apaga"  on public.docs for delete using (auth.uid() = user_id);

-- Atualização ao vivo entre celular e computador
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
