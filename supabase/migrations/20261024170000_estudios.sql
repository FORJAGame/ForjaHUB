-- Estúdios do portal de cadastro (forjagames): cada Jogo pertence a um
-- estúdio, e só os membros dele (e os admins da FORJA) editam o Jogo.
--
-- Papéis: `dono` convida, gere o time e publica no Hub; `membro` cadastra e
-- edita dados, arte e build. Admins da FORJA ficam fora do banco (variável
-- ADMIN_EMAILS do portal) e enxergam tudo.
--
-- Como as tabelas `portal_*`, tudo aqui é lido e escrito só pelo servidor do
-- portal (service role). O Hub não usa nada disso.

create table public.estudios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  criado_em timestamptz not null default now()
);

create unique index estudios_nome_unico_idx on public.estudios (lower(btrim(nome)));

create table public.estudio_membros (
  estudio_id uuid not null references public.estudios (id) on delete cascade,
  user_id text not null references public.portal_user ("id") on delete cascade,
  papel text not null check (papel in ('dono', 'membro')),
  criado_em timestamptz not null default now(),
  primary key (estudio_id, user_id)
);

create index estudio_membros_user_idx on public.estudio_membros (user_id);

-- O link de convite carrega o token; aqui fica só o SHA-256 dele.
create table public.convites (
  id uuid primary key default gen_random_uuid(),
  estudio_id uuid not null references public.estudios (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '_%@_%'),
  papel text not null check (papel in ('dono', 'membro')),
  token_hash text not null unique,
  criado_por text references public.portal_user ("id") on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  aceito_em timestamptz
);

create index convites_pendentes_email_idx on public.convites (email) where aceito_em is null;

-- Sem estúdio = só admins enxergam (Jogos cadastrados antes dos estúdios).
-- `restrict`: excluir um estúdio com Jogos exige mover os Jogos antes.
alter table public.jogos
  add column estudio_id uuid references public.estudios (id) on delete restrict;

create index jogos_estudio_idx on public.jogos (estudio_id);

alter table public.estudios enable row level security;
alter table public.estudio_membros enable row level security;
alter table public.convites enable row level security;

revoke all on public.estudios, public.estudio_membros, public.convites from anon, authenticated;
