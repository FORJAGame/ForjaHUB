-- Catálogo de Jogos + Sessões de Jogo (analytics) + mídia no Storage.
--
-- O Hub usa só a anon key: lê `jogos` e a mídia, e grava Sessões só pela
-- função `registrar_sessoes` (sem ler, alterar ou apagar `sessoes`).
-- Quem edita o catálogo e sobe mídia usa outra credencial (service role ou
-- usuário autenticado), nunca a chave embarcada nas estações.

-- --- Catálogo -----------------------------------------------------------------

-- Espelha o `JogoMetadataSchema` do Hub; o Hub revalida tudo no sync.
create table public.jogos (
  id text primary key
    check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo text not null check (btrim(titulo) <> ''),
  ano integer not null check (ano between 1970 and 2100),
  guilda text not null check (btrim(guilda) <> ''),
  genero text not null check (btrim(genero) <> ''),
  modalidade text not null check (modalidade in ('single-player', 'multiplayer')),
  sinopse text not null check (btrim(sinopse) <> ''),
  -- Vazio = sem selo QR.
  redes_url text not null default '',
  -- Caminho do executável dentro de `games/<id>/`; vazio = o Hub descobre sozinho.
  exe_relativo text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create function public.tocar_atualizado_em() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger jogos_atualizado_em
  before update on public.jogos
  for each row execute function public.tocar_atualizado_em();

alter table public.jogos enable row level security;

revoke all on public.jogos from anon, authenticated;
grant select on public.jogos to anon, authenticated;

create policy "catalogo publico para leitura"
  on public.jogos for select
  to anon, authenticated
  using (true);

-- --- Sessões de Jogo (analytics) ----------------------------------------------

-- Um registro por Sessão, sem dado pessoal. `id` é o UUID gerado na estação:
-- reenviar o mesmo registro cai no `on conflict do nothing` e não duplica.
-- Sem FK para `jogos`: um Jogo removido do catálogo não pode travar o envio
-- das Sessões que já estão no disco das estações.
create table public.sessoes (
  id uuid primary key,
  evento_id text not null,
  estacao_id text not null,
  jogo_id text not null,
  inicio timestamptz not null,
  duracao_seg integer not null check (duracao_seg >= 0),
  -- Sessão sem fecho limpo (queda de energia, quit com Jogo aberto).
  incompleta boolean not null default false,
  recebido_em timestamptz not null default now()
);

create index sessoes_evento_inicio_idx on public.sessoes (evento_id, inicio);
create index sessoes_jogo_idx on public.sessoes (jogo_id);

-- RLS ligado e sem policy: anon/authenticated não leem, não alteram e não
-- apagam nada direto na tabela. A estação só grava via `registrar_sessoes`.
alter table public.sessoes enable row level security;
revoke all on public.sessoes from anon, authenticated;

-- Insert direto com `on conflict (id)` exige SELECT na tabela, o que abriria
-- a leitura das Sessões para a anon key. A função roda como dona da tabela e
-- expõe só o insert idempotente de um lote.
create function public.registrar_sessoes(sessoes jsonb) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sessoes (id, evento_id, estacao_id, jogo_id, inicio, duracao_seg, incompleta)
  select s.id, s.evento_id, s.estacao_id, s.jogo_id, s.inicio, s.duracao_seg, coalesce(s.incompleta, false)
  from jsonb_to_recordset(sessoes) as s(
    id uuid,
    evento_id text,
    estacao_id text,
    jogo_id text,
    inicio timestamptz,
    duracao_seg integer,
    incompleta boolean
  )
  on conflict (id) do nothing;
$$;

revoke execute on function public.registrar_sessoes(jsonb) from public;
grant execute on function public.registrar_sessoes(jsonb) to anon;

-- --- Mídia --------------------------------------------------------------------

-- `midia/<id do Jogo>/capa.*`, `hero.*`, `logo.*` e `detalhe-N.*`.
insert into storage.buckets (id, name, public)
values ('midia', 'midia', false)
on conflict (id) do nothing;

create policy "midia publica para leitura"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'midia');
