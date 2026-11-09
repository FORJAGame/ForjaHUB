-- Logo quadrada do estúdio no portal de cadastro (opcional).
--
-- O arquivo fica no bucket privado `logos-estudios`, em `<estudio_id>/<uuid>.<ext>`;
-- `estudios.logo` guarda só o caminho. O dono do estúdio (ou um admin) envia pelo
-- portal, que confere tamanho e se a imagem é quadrada antes de gravar.
--
-- A anon key das estações continua lendo só `estudios.id` e `estudios.nome` (grant
-- por coluna): a coluna nova fica fora dela.

alter table public.estudios add column logo text;

-- 3 MB, só imagem raster. Sem policy: o portal assina o envio direto do navegador
-- e baixa de volta para conferir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos-estudios', 'logos-estudios', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
