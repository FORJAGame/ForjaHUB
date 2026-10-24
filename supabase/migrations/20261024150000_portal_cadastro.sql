-- Portal de cadastro (forjagames): login do Better Auth, rascunho de Jogo e
-- bucket de builds.
--
-- O portal fala com o banco por duas credenciais de servidor: a conexão
-- Postgres do Better Auth (tabelas `portal_*`) e a service role (catálogo e
-- Storage). Nada aqui fica visível para a anon key das estações.

-- --- Rascunho ------------------------------------------------------------------

-- O sync do Hub é tudo-ou-nada: um Jogo na tabela sem a mídia completa derruba
-- o Catálogo de todas as estações. O portal cria o Jogo como rascunho e só
-- publica depois de conferir capa, hero, logo e ao menos um detalhe-N.
-- Linhas existentes continuam visíveis (default true no add column).
alter table public.jogos add column publicado boolean not null default true;
alter table public.jogos alter column publicado set default false;

-- A anon key (Hub) só enxerga Jogos publicados.
drop policy "catalogo publico para leitura" on public.jogos;

create policy "catalogo publicado para leitura"
  on public.jogos for select
  to anon, authenticated
  using (publicado);

-- --- Better Auth -----------------------------------------------------------------

-- Gerado pelo `getMigrations` do Better Auth (modelName com prefixo `portal_`).
create table public.portal_user (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table public.portal_session (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references public.portal_user ("id") on delete cascade
);

create table public.portal_account (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references public.portal_user ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null
);

create table public.portal_verification (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create index "portal_session_userId_idx" on public.portal_session ("userId");
create index "portal_account_userId_idx" on public.portal_account ("userId");
create index "portal_verification_identifier_idx" on public.portal_verification ("identifier");

-- Sessões e hashes de senha: o `public` é exposto pela API do Supabase, então
-- RLS ligado sem policy e sem grant para anon/authenticated. Só a conexão
-- Postgres do Better Auth (dona das tabelas) lê e escreve.
alter table public.portal_user enable row level security;
alter table public.portal_session enable row level security;
alter table public.portal_account enable row level security;
alter table public.portal_verification enable row level security;

revoke all on public.portal_user, public.portal_session, public.portal_account, public.portal_verification
  from anon, authenticated;

-- --- Builds ----------------------------------------------------------------------

-- `builds/<id do Jogo>/build.zip`. Privado e sem policy: só a service role
-- (portal) lê e grava. O tamanho máximo segue o limite global do Storage
-- (Dashboard → Storage → Settings).
insert into storage.buckets (id, name, public)
values ('builds', 'builds', false)
on conflict (id) do nothing;
