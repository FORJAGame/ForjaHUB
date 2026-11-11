-- Cargos no estúdio (portal de cadastro): a função de cada pessoa no time.
--
-- Independente do papel: `dono`/`membro` continua dizendo quem gere o time e
-- publica; o cargo diz o que a pessoa faz, e o dono também pode ter um. Uma
-- pessoa pode ter vários. No portal, `designer` edita a arte do Jogo e `dev`
-- envia a build; os outros são só rótulo. O dono faz tudo, com ou sem cargo.
--
-- Quem já está em um estúdio começa sem cargo: cada pessoa marca os próprios na
-- página do estúdio (o dono e os admins ajustam os de qualquer um).
--
-- A lista do check é a mesma de `CARGOS` em `src/lib/acesso.ts` do portal.

alter table public.estudio_membros
  add column cargos text[] not null default '{}'
  constraint estudio_membros_cargos_validos
    check (cargos <@ array['dev', 'designer', 'sonoplasta', 'roteirista', 'qa']);
