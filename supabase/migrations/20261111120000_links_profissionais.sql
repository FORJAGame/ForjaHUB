-- Links profissionais no perfil (censo) do portal de cadastro.
--
-- O campo era só LinkedIn; agora é "link profissional": um obrigatório e um
-- segundo opcional (LinkedIn e portfólio, Instagram e portfólio...). O tipo não é
-- gravado: o portal deduz pelo domínio (linkedin.com, instagram.com, ou portfólio).
--
-- O LinkedIn de quem já tem perfil vira o primeiro link.

alter table public.perfis add column links text[];

update public.perfis set links = array[linkedin_url];

alter table public.perfis
  alter column links set not null,
  add constraint perfis_links_validos check (
    cardinality(links) between 1 and 2
    and array_to_string(links, ' ') ~ '^https?://\S+( https?://\S+)?$'
  ),
  drop column linkedin_url;
