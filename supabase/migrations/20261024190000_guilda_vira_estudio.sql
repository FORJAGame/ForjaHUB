-- "Guilda" sai de cena: quem assina um Jogo é o estúdio (Game Studio) da
-- tabela `estudios`. O Hub passa a ler o nome do estúdio pela FK
-- (`...estudios(estudio:nome)`), e renomear um estúdio no portal chega às
-- estações no próximo sync.

-- Jogos ainda sem estúdio ganham o estúdio com o nome da guilda (criado se
-- não existir; mesmo nome sem diferenciar maiúsculas/espaços = mesmo estúdio).
insert into public.estudios (nome)
select distinct on (lower(btrim(guilda))) btrim(guilda)
from public.jogos
where estudio_id is null
on conflict ((lower(btrim(nome)))) do nothing;

update public.jogos j
set estudio_id = e.id
from public.estudios e
where j.estudio_id is null
  and lower(btrim(e.nome)) = lower(btrim(j.guilda));

-- Todo Jogo tem estúdio: é o crédito que o Hub mostra.
alter table public.jogos alter column estudio_id set not null;
alter table public.jogos drop column guilda;

-- A anon key (Hub) lê só o nome do estúdio, para montar o Catálogo. Membros
-- e convites continuam fechados.
grant select (id, nome) on public.estudios to anon, authenticated;

create policy "nome do estudio publico para leitura"
  on public.estudios for select
  to anon, authenticated
  using (true);
