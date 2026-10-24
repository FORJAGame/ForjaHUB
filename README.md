> [!CAUTION]
> **Este projeto está em desenvolvimento ativo e não é utilizável em produção.**
> A reescrita está em andamento in-place: funcionalidades descritas abaixo
> podem estar parcialmente implementadas, atrás de stubs, ou ainda não
> existirem. Veja [Estado atual](#estado-atual) antes de assumir qualquer
> comportamento.

-----

<div align="center">

# FORJA Hub

[Rodando](#rodando) • [Como usar](docs/USO.md) • [Estado atual](#estado-atual) • [Estrutura](#estrutura-do-projeto) • [Contribuir](#contribuir)

![CI](https://github.com/FORJAGame/ForjaHUB/actions/workflows/ci.yml/badge.svg)
![Em desenvolvimento](https://img.shields.io/badge/status-em%20desenvolvimento-orange?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)

</div>

---

### Sumário
- [Introdução](#introdução)
- [Estado atual](#estado-atual)
- [Stack](#stack)
- [Rodando](#rodando)
- [Como usar o Hub](docs/USO.md) — operação, Catálogo, mídia e atalhos
- [Estrutura do projeto](#estrutura-do-projeto)
- [Contribuir](#contribuir)


# Introdução

O FORJA Hub é o launcher desktop de jogos da FORJA Game Studio para estações
de eventos ao estilo **Steam Big Picture**, pensado para funcionar em estações
com múltiplos periféricos e sem depender de internet estável.

Este README documenta o que **existe e funciona agora**, não a visão final do produto.

Para operar o Hub numa estação de evento (configuração, Catálogo, mídia e
atalhos), veja [Como usar o FORJA Hub](docs/USO.md).


# Estado atual

O que já está implementado e testado:

- **Catálogo sincronizado com o Supabase**: no boot, o main lê a tabela
  `jogos`, valida cada linha com Zod e baixa a mídia de cada Jogo do bucket
  `midia` (veja [Supabase](#supabase)).
- **Cache offline**: o catálogo validado (`catalog.json` + mídia) é gravado
  em `userData/catalog/current/` por troca atômica de diretório.
- **Setup de estação**: na primeira execução, a `SetupScreen` lista os Jogos
  do catálogo para escolher quais a estação exibe, e grava `station.json`
  com escrita atômica. Se nenhum Jogo selecionado existir mais no catálogo,
  o Hub volta para o setup.
- **Tela de catálogo (kiosk)**: vitrine com arte-herói do Jogo em foco, logo
  com fallback para o título, chips de ano, guilda e gênero, e uma fileira
  rolável de cards com navegação circular (o foco dá a volta), por controle,
  teclado ou mouse, com faíscas e um clique sonoro sintetizado a cada troca de
  foco. Só os Jogos selecionados na estação aparecem.
- **Base de input**: captura de teclado e gamepad (XInput) no renderer, com
  guarda para não interceptar teclas quando um elemento editável está
  focado, e cursor que some quando fica parado.
- **Launcher de processo**: módulo no main para abrir executáveis locais e
  monitorar o fechamento (evento de saída do processo ou polling por nome
  do processo alvo).
- **JOGAR**: o renderer pede `game:launch`, o main resolve o executável em
  `userData/games/<id>/`, abre pelo launcher de processo, recolhe a janela
  ~1,5s depois e a recria quando o Jogo fecha, voltando ao card jogado. O
  selo QR das redes do Jogo é gerado no main (`qrcode`) e servido por
  `forja://media/<id>/qr`.
- **Analytics de sessão**: cada Sessão de Jogo vira um registro anônimo
  (Jogo, estação, evento, início, duração) gravado em `userData/analytics/`
  e enviado em segundo plano para a tabela `sessoes` (veja
  [Analytics](#analytics)).

O que **ainda não existe**:

- Download e extração do `.zip` do Jogo: o build entra à mão, em
  `<userData>/games/<id>/` (veja [Instalando um Jogo à mão](#instalando-um-jogo-à-mão)).
- Modo atração, painel do operador (`Ctrl+Shift+O` só troca para um
  placeholder), busca e filtros.
- Empacotamento e instalador testados para Windows (alvo principal).

## Instalando um Jogo à mão

O Hub não baixa builds (no momento): coloque os arquivos do Jogo em `games/<id>/` dentro do `userData` da estação — `~/.config/forja-hub/games/<id>/` no Linux e
`%APPDATA%\forja-hub\games\<id>\` no Windows, sendo `<id>` o `id` do Jogo na
tabela `jogos`.

Com `exe_relativo` preenchido no Catálogo, é esse o executável aberto, sempre
confinado à pasta do Jogo (aceita `sub/pasta/Jogo.exe`, com `/` ou `\`).
Vazio, o Hub procura sozinho até 2 níveis abaixo da pasta do Jogo: no Windows,
o único `.exe`; nas outras plataformas, o único arquivo com permissão de
execução (fora bibliotecas `.so`, `.so.N` e `.dylib`). Auxiliares conhecidos
(`unins000`, `UnityCrashHandler*`, `crashpad_handler`, `notification_helper`,
`vc_redist*`, `dxsetup`, `UE4PrereqSetup*` e o `*.console` do Godot) são
ignorados. Sem candidato ou com mais de um, o JOGAR falha e o motivo vai para o
log do `main`; o `exe_relativo` é quem desempata.

## Supabase

Catálogo, mídia e analytics vivem num projeto Supabase. O schema está em
[`supabase/migrations/`](supabase/migrations): aplique com
`npx supabase db push` no projeto (ou cole o SQL no SQL Editor).

- **`jogos`**: uma linha por Jogo. Colunas `id` (kebab-case, chave),
  `titulo`, `ano`, `guilda`, `genero`, `modalidade` (`single-player` ou
  `multiplayer`), `sinopse`, `redes_url` e `exe_relativo` (os dois últimos
  aceitam vazio). O Catálogo sai ordenado por `id`.
- **Bucket `midia`**: uma pasta por Jogo com o nome do `id`, contendo
  `capa.*`, `hero.*`, `logo.*` e ao menos um `detalhe-N.*`.
- **`sessoes`**: recebe o analytics (veja abaixo).

O Hub usa só a **anon key**, e grants + RLS limitam o que ela faz: ler
`jogos` e a mídia, e gravar Sessões pela função `registrar_sessoes` (sem
ler, alterar ou apagar `sessoes`). Quem cadastra
Jogos e sobe mídia usa outra credencial (painel do Supabase, service role
num backend ou usuário autenticado com policy própria), nunca a chave das
estações.

A URL e a anon key vão em `MAIN_VITE_SUPABASE_URL` e
`MAIN_VITE_SUPABASE_ANON_KEY` no `.env`, ou em `supabaseUrl` e
`supabaseAnonKey` em `userData/config/app-config.json` (cada campo do arquivo
sobrepõe o do build). O sync do boot é tudo-ou-nada: um Jogo inválido ou uma
mídia faltando descarta o sync e mantém o cache anterior.

## Analytics

Cada Sessão de Jogo gera um registro sem dado pessoal, carimbado com a
estação e o evento do setup. Ele é gravado em disco antes de qualquer envio
(`userData/analytics/spool.jsonl`, com `fsync`), então nada se perde sem rede
ou numa queda de energia. Um Jogo aberto mantém `open-session.json` atualizado
a cada minuto: se a estação desligar, o próximo boot fecha a sessão com
`incompleta = true`. Fechar o Hub com `Ctrl+Shift+Q` durante um Jogo também
marca `incompleta`, mas com a duração real.

O envio vai para a tabela `sessoes`: `id` (UUID gerado na estação),
`evento_id`, `estacao_id`, `jogo_id`, `inicio` (`timestamptz`),
`duracao_seg`, `incompleta` e `recebido_em` (preenchido pelo banco). Horário
local sai na consulta, ex.: `inicio at time zone 'America/Recife'`. O envio
roda depois do sync do boot e uns segundos após cada Sessão. Sem rede, tenta
de novo em 5 min e depois a cada 10 min. Reenviar nunca duplica linha:
`registrar_sessoes` usa `on conflict (id) do nothing`. Sem URL ou anon key, os registros
continuam no disco e sobem quando a configuração existir.

# Stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [supabase-js](https://supabase.com/docs/reference/javascript) (Postgres + Storage) e [Zod](https://zod.dev/) para validar o catálogo
- [Vitest](https://vitest.dev/) para os testes
- [electron-builder](https://www.electron.build/) — empacotamento (ainda não validado em Windows)

# Rodando

**Pré-requisitos:** Node.js 20.19+ ou 22.12+ (exigência do Vite 7; a CI usa
Node 22).

```sh
npm install
cp .env.example .env   # preencha URL e anon key do Supabase
npm run dev
```

Sem essa configuração o Hub abre, mas o sync aborta e a tela mostra o erro
(`CATALOGO_NAO_CONFIGURADO`). É configuração faltando,
não bug.

> [!IMPORTANT]
> `npm run dev` **não** roda typecheck — só `npm run build` roda. Rode lint
> e typecheck manualmente antes de abrir um PR:
> ```sh
> npm run lint
> npm run typecheck
> ```
> Isso também roda automaticamente: um git hook local (`.githooks/pre-push`,
> ativado via `npm install`) bloqueia o `push` se lint ou typecheck
> falharem, e o [CI no GitHub Actions](.github/workflows/ci.yml) roda a
> mesma verificação em cada push de branch e PR para a `main`.

Outros scripts úteis:

- `npm test`: roda os testes (Vitest). O hook `pre-push` e a CI não rodam os
  testes, então rode antes de abrir um PR.
- `npm run build`: typecheck + build de produção via electron-vite.
- `npm start`: abre o build de produção (`electron-vite preview`).
- `npm run build:unpack`: build + app desempacotado (sem instalador).
- `npm run build:win` / `build:mac` / `build:linux`: empacotamento via electron-builder (Windows é o alvo real; os demais não foram validados em estação de evento).

O desenvolvimento acontece em Linux, mas o alvo principal é Windows, pois a
maioria dos jogos distribuídos pela FORJA é Windows-only. No Windows o
launcher detecta o processo do Jogo com `tasklist`; no Linux usa `pgrep -x`
só para permitir rodar em dev. Detecção de fechamento do executável e tempo
de sessão só valem como validados depois de testados numa estação Windows.

# Estrutura do projeto

```
ForjaHUB/
├── src/
│   ├── main/
│   │   ├── catalog/    # Sync Supabase (jogos + mídia), schema, cache, boot, protocolo forja://
│   │   ├── config/     # URL/chave do Supabase e handlers IPC de setup/hydrate
│   │   ├── supabase/   # Cliente supabase-js (tabelas e bucket usados pelo Hub)
│   │   ├── analytics/  # Spool em disco, registro de Sessão e envio para `sessoes`
│   │   ├── store/      # station.json e escrita atômica (arquivo e diretório)
│   │   ├── launcher/   # Spawn e monitoramento de processo do Jogo
│   │   └── index.ts    # Janela kiosk, protocolo, IPC e atalhos
│   ├── preload/        # contextBridge / ponte forjaAPI
│   ├── renderer/src/
│   │   ├── design/     # Tokens, fontes e primitivos visuais
│   │   ├── screens/    # setup, catalog, detail
│   │   ├── input/      # Teclado, gamepad e foco
│   │   └── state/      # Reducer da aplicação
│   └── shared/         # Tipos, canais IPC, forjaAPI e mediaUrl
├── supabase/           # Migrations do banco (tabelas, RLS, bucket)
├── public/             # Assets do renderer (logo, favicon)
├── resources/          # Assets fora do build do renderer (hoje não referenciados no código)
└── build/              # Ícones e configuração de empacotamento
```

Assets do renderer ficam em `public/` e são referenciados via
`import.meta.env.BASE_URL` (o build empacotado abre via `file://`).

# Contribuir

- Nunca commitamos direto na `main`. Todo trabalho vai em branches.
- Commits são atômicos (um por mudança lógica).
- Rode `npm run lint`, `npm run typecheck` e `npm test` antes de abrir um
  PR. Lint e typecheck são reforçados automaticamente: o hook `pre-push`
  bloqueia o push se algum dos dois falhar, e a [CI](.github/workflows/ci.yml)
  roda a mesma checagem em cada push de branch e PR para a `main`. Os testes
  não rodam em nenhum dos dois.

Uso interno — FORJA Game Studio / CESAR.
