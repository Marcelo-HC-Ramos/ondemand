-- =====================================================================
--  OnDemand — banco multiempresa (Supabase / PostgreSQL)
--  Rode este arquivo inteiro no Supabase: SQL Editor → New query → Run.
--  Pode rodar de novo sem perder dados (é idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.organizacoes (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (length(trim(nome)) between 2 and 120),
  cnpj         text,
  telefone     text,
  plano        text not null default 'teste' check (plano in ('teste','ativo','suspenso')),
  teste_ate    date not null default (current_date + 14),
  config       jsonb not null default '{}'::jsonb,
  seq_os       bigint not null default 0,
  criado_por   uuid references auth.users(id) on delete set null,
  criado_em    timestamptz not null default now()
);

create table if not exists public.membros (
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  papel      text not null default 'operador' check (papel in ('admin','operador','tecnico')),
  nome       text,
  email      text,
  criado_em  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists membros_user_idx on public.membros(user_id);

create table if not exists public.convites (
  codigo      text primary key default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  org_id      uuid not null references public.organizacoes(id) on delete cascade,
  papel       text not null default 'operador' check (papel in ('admin','operador','tecnico')),
  criado_por  uuid references auth.users(id) on delete set null,
  usado_por   uuid references auth.users(id) on delete set null,
  usado_em    timestamptz,
  expira_em   timestamptz not null default (now() + interval '7 days'),
  criado_em   timestamptz not null default now()
);
create index if not exists convites_org_idx on public.convites(org_id);

create table if not exists public.lotes_importacao (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizacoes(id) on delete cascade,
  arquivo     text,
  total       int not null default 0,
  criado_por  uuid references auth.users(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists lotes_org_idx on public.lotes_importacao(org_id);

create table if not exists public.demandas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  numero         text,
  status         text not null default 'pendente'
                 check (status in ('pendente','agendada','aguardando_peca','reagendar','concluida','cancelada')),
  tipo           text not null default 'garantia' check (tipo in ('garantia','fora_garantia')),
  regiao         text,
  data_agendada  date,
  ordem_rota     int not null default 0,
  concluida_em   date,
  criada_em      date not null default current_date,
  empresa        text,
  os_empresa     text,
  problema       text,
  cliente        jsonb not null default '{}'::jsonb,
  equipamento    jsonb not null default '{}'::jsonb,
  visita         jsonb not null default '{}'::jsonb,
  fin            jsonb not null default '{}'::jsonb,
  lote_id        uuid references public.lotes_importacao(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
create index if not exists demandas_org_idx      on public.demandas(org_id);
create index if not exists demandas_org_data_idx on public.demandas(org_id, data_agendada);
create index if not exists demandas_org_stat_idx on public.demandas(org_id, status);
create index if not exists demandas_lote_idx     on public.demandas(lote_id);
create unique index if not exists demandas_org_numero_uq on public.demandas(org_id, numero);

-- Atualizações de versões anteriores (rodar de novo é seguro)
alter table public.demandas alter column numero type text using numero::text;
alter table public.membros add column if not exists pode_editar_demandas boolean not null default false;

-- Donos da plataforma (você). Adicione seu usuário depois do primeiro cadastro:
--   insert into public.plataforma_admins(user_id)
--   select id from auth.users where email = 'seu-email@exemplo.com';
create table if not exists public.plataforma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Funções auxiliares (security definer evita recursão nas políticas)
-- ---------------------------------------------------------------------
create or replace function public.minhas_orgs()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from public.membros where user_id = auth.uid()
$$;

create or replace function public.meu_papel(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select papel from public.membros where org_id = p_org and user_id = auth.uid()
$$;

create or replace function public.sou_admin_plataforma()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.plataforma_admins where user_id = auth.uid())
$$;

-- Empresa pode gravar? (em teste dentro do prazo, ou plano ativo)
create or replace function public.org_ativa(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.organizacoes o
    where o.id = p_org
      and (o.plano = 'ativo' or (o.plano = 'teste' and o.teste_ate >= current_date))
  )
$$;

-- ---------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------
-- Nº da OS: sem espaços nas pontas; vazio vira nulo (a demanda fica "sem OS")
create or replace function public.tg_demanda_normaliza()
returns trigger language plpgsql as $$
begin
  new.numero := nullif(trim(new.numero), '');
  return new;
end $$;
drop trigger if exists demanda_normaliza on public.demandas;
create trigger demanda_normaliza before insert or update on public.demandas
  for each row execute function public.tg_demanda_normaliza();

-- Carimbo de alteração + limites do técnico
--  * técnico sem permissão: só muda o andamento (status / data de conclusão)
--  * técnico com permissão do administrador: altera a demanda, menos o Nº da OS
create or replace function public.tg_demanda_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pode boolean;
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if new.org_id <> old.org_id then
    raise exception 'Não é permitido mover a demanda para outra empresa';
  end if;
  if public.meu_papel(old.org_id) = 'tecnico' then
    select pode_editar_demandas into v_pode from public.membros
      where org_id = old.org_id and user_id = auth.uid();
    if new.numero is distinct from old.numero then
      raise exception 'Somente o administrativo altera o número da OS';
    end if;
    if not coalesce(v_pode, false) and
       (new.cliente, new.equipamento, new.fin, new.tipo, new.regiao, new.data_agendada, new.ordem_rota,
        new.empresa, new.os_empresa, new.problema, new.visita)
       is distinct from
       (old.cliente, old.equipamento, old.fin, old.tipo, old.regiao, old.data_agendada, old.ordem_rota,
        old.empresa, old.os_empresa, old.problema, old.visita) then
      raise exception 'Você não tem permissão para alterar esta demanda. Peça ao administrador.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists demanda_update on public.demandas;
create trigger demanda_update before update on public.demandas
  for each row execute function public.tg_demanda_update();

-- Admin da empresa não altera o próprio plano; só o dono da plataforma
create or replace function public.tg_org_protege_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.plano, new.teste_ate, new.seq_os) is distinct from (old.plano, old.teste_ate, old.seq_os)
     and not public.sou_admin_plataforma()
     and auth.uid() is not null  -- sem usuário = painel do Supabase / chave de serviço
     and current_setting('ondemand.interno', true) is distinct from '1' then
    raise exception 'Plano e prazo de teste são alterados apenas pela administração da plataforma';
  end if;
  return new;
end $$;
drop trigger if exists org_protege_plano on public.organizacoes;
create trigger org_protege_plano before update on public.organizacoes
  for each row execute function public.tg_org_protege_plano();

-- A numeração automática no cadastro foi substituída pelo botão "Gerar" (função abaixo)
drop trigger if exists demanda_numero on public.demandas;
drop function if exists public.tg_demanda_numero();

-- ---------------------------------------------------------------------
-- Segurança por linha (cada empresa só enxerga os próprios dados)
-- ---------------------------------------------------------------------
alter table public.organizacoes     enable row level security;
alter table public.membros          enable row level security;
alter table public.convites         enable row level security;
alter table public.lotes_importacao enable row level security;
alter table public.demandas         enable row level security;
alter table public.plataforma_admins enable row level security;

drop policy if exists org_select on public.organizacoes;
create policy org_select on public.organizacoes for select
  using (id in (select public.minhas_orgs()) or public.sou_admin_plataforma());
drop policy if exists org_update on public.organizacoes;
create policy org_update on public.organizacoes for update
  using (public.meu_papel(id) = 'admin' or public.sou_admin_plataforma());
-- criação de empresa só pela função criar_organizacao()

drop policy if exists mem_select on public.membros;
create policy mem_select on public.membros for select
  using (org_id in (select public.minhas_orgs()) or public.sou_admin_plataforma());
drop policy if exists mem_update on public.membros;
create policy mem_update on public.membros for update
  using (public.meu_papel(org_id) = 'admin');
drop policy if exists mem_delete on public.membros;
create policy mem_delete on public.membros for delete
  using (public.meu_papel(org_id) = 'admin' or user_id = auth.uid());

drop policy if exists conv_all on public.convites;
create policy conv_all on public.convites for all
  using (public.meu_papel(org_id) = 'admin')
  with check (public.meu_papel(org_id) = 'admin');

drop policy if exists lote_select on public.lotes_importacao;
create policy lote_select on public.lotes_importacao for select
  using (org_id in (select public.minhas_orgs()));
drop policy if exists lote_write on public.lotes_importacao;
create policy lote_write on public.lotes_importacao for insert
  with check (public.meu_papel(org_id) in ('admin','operador') and public.org_ativa(org_id));
drop policy if exists lote_delete on public.lotes_importacao;
create policy lote_delete on public.lotes_importacao for delete
  using (public.meu_papel(org_id) in ('admin','operador'));

drop policy if exists dem_select on public.demandas;
create policy dem_select on public.demandas for select
  using (org_id in (select public.minhas_orgs()));
drop policy if exists dem_insert on public.demandas;
create policy dem_insert on public.demandas for insert
  with check (public.meu_papel(org_id) in ('admin','operador') and public.org_ativa(org_id));
drop policy if exists dem_update on public.demandas;
create policy dem_update on public.demandas for update
  using (org_id in (select public.minhas_orgs()) and public.org_ativa(org_id))
  with check (org_id in (select public.minhas_orgs()));
drop policy if exists dem_delete on public.demandas;
create policy dem_delete on public.demandas for delete
  using (public.meu_papel(org_id) in ('admin','operador'));

drop policy if exists pa_select on public.plataforma_admins;
create policy pa_select on public.plataforma_admins for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Funções chamadas pelo app
-- ---------------------------------------------------------------------
create or replace function public.criar_organizacao(p_nome text, p_cnpj text, p_nome_usuario text, p_config jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.organizacoes(nome, cnpj, config, criado_por)
    values (trim(p_nome), nullif(trim(p_cnpj), ''), coalesce(p_config, '{}'::jsonb), auth.uid())
    returning id into v_org;
  insert into public.membros(org_id, user_id, papel, nome, email)
    values (v_org, auth.uid(), 'admin', nullif(trim(p_nome_usuario), ''), v_email);
  return v_org;
end $$;

create or replace function public.entrar_com_convite(p_codigo text, p_nome_usuario text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.convites%rowtype; v_email text;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  select * into c from public.convites where codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'Código de convite não encontrado'; end if;
  if c.usado_por is not null then raise exception 'Este convite já foi usado'; end if;
  if c.expira_em < now() then raise exception 'Este convite expirou. Peça um novo ao administrador'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.membros(org_id, user_id, papel, nome, email)
    values (c.org_id, auth.uid(), c.papel, nullif(trim(p_nome_usuario), ''), v_email)
    on conflict (org_id, user_id) do nothing;
  update public.convites set usado_por = auth.uid(), usado_em = now() where codigo = c.codigo;
  return c.org_id;
end $$;

-- Visão geral para o dono da plataforma
create or replace function public.resumo_plataforma()
returns table(id uuid, nome text, cnpj text, plano text, teste_ate date, criado_em timestamptz,
              membros bigint, demandas bigint, demandas_30d bigint, admin_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin_plataforma() then raise exception 'Acesso restrito'; end if;
  return query
    select o.id, o.nome, o.cnpj, o.plano, o.teste_ate, o.criado_em,
      (select count(*) from public.membros m where m.org_id = o.id),
      (select count(*) from public.demandas d where d.org_id = o.id),
      (select count(*) from public.demandas d where d.org_id = o.id and d.criada_em >= current_date - 30),
      (select m.email from public.membros m where m.org_id = o.id and m.papel = 'admin' order by m.criado_em limit 1)
    from public.organizacoes o order by o.criado_em desc;
end $$;

create or replace function public.definir_plano(p_org uuid, p_plano text, p_teste_ate date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin_plataforma() then raise exception 'Acesso restrito'; end if;
  update public.organizacoes set plano = p_plano, teste_ate = coalesce(p_teste_ate, teste_ate) where id = p_org;
end $$;

-- Reserva os próximos números de OS da empresa (botão "Gerar" e importação em lote).
-- Pula números que o administrativo já tenha digitado manualmente.
create or replace function public.gerar_numeros_os(p_org uuid, p_qtd int default 1, p_prefixo text default '')
returns setof text language plpgsql security definer set search_path = public as $$
declare v_seq bigint; v_num text; v_gerados int := 0;
begin
  if public.meu_papel(p_org) not in ('admin','operador') then
    raise exception 'Somente o administrativo gera números de OS';
  end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 5000 then raise exception 'Quantidade inválida'; end if;
  perform set_config('ondemand.interno', '1', true);
  while v_gerados < p_qtd loop
    update public.organizacoes set seq_os = seq_os + 1 where id = p_org returning seq_os into v_seq;
    v_num := coalesce(trim(p_prefixo), '') || lpad(v_seq::text, 4, '0');
    if not exists(select 1 from public.demandas where org_id = p_org and numero = v_num) then
      v_gerados := v_gerados + 1;
      return next v_num;
    end if;
  end loop;
  perform set_config('ondemand.interno', '', true);
end $$;

grant execute on function public.gerar_numeros_os(uuid, int, text) to authenticated;
revoke execute on function public.gerar_numeros_os(uuid, int, text) from anon;
grant execute on function public.criar_organizacao(text, text, text, jsonb) to authenticated;
grant execute on function public.entrar_com_convite(text, text) to authenticated;
grant execute on function public.resumo_plataforma() to authenticated;
grant execute on function public.definir_plano(uuid, text, date) to authenticated;
revoke execute on function public.criar_organizacao(text, text, text, jsonb) from anon;
revoke execute on function public.entrar_com_convite(text, text) from anon;
revoke execute on function public.resumo_plataforma() from anon;
revoke execute on function public.definir_plano(uuid, text, date) from anon;

-- ---------------------------------------------------------------------
-- Atualização em tempo real (a tela de todos atualiza sozinha)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.demandas;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.membros;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.organizacoes;
exception when duplicate_object then null; when undefined_object then null; end $$;
