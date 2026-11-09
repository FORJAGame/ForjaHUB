-- Perfil (censo) de cada pessoa do portal: obrigatório para usar o painel.
--
-- O Erick (admin) usa os dados para o censo da FORJA: nome, apelido, nascimento,
-- LinkedIn, se a pessoa é da CESAR School e onde mora. A foto fica no bucket
-- privado `avatares`, em `<user_id>/<uuid>.<ext>`; o perfil guarda só o caminho.
--
-- Como as outras tabelas do portal, é lida e escrita só pelo servidor (service
-- role), com RLS ligado e sem policy.

create table public.perfis (
  user_id text primary key references public.portal_user ("id") on delete cascade,
  nome_completo text not null check (btrim(nome_completo) <> ''),
  apelido text not null check (btrim(apelido) <> ''),
  nascimento date not null check (nascimento >= '1900-01-01'),
  linkedin_url text not null check (linkedin_url like 'https://www.linkedin.com/in/%'),
  cesar_school boolean not null,
  cidade text not null check (btrim(cidade) <> ''),
  uf char(2) not null check (
    uf in (
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
      'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
      'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    )
  ),
  foto text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

revoke all on public.perfis from anon, authenticated;

-- Foto de perfil: 3 MB, só imagem raster. Sem policy: o portal assina o envio
-- direto do navegador e baixa de volta para conferir tamanho e dimensões.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
