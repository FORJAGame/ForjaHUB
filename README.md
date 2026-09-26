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
- [Como usar o Hub](docs/USO.md) — operação, Planilha, mídia e atalhos
- [Estrutura do projeto](#estrutura-do-projeto)
- [Contribuir](#contribuir)


# Introdução

O FORJA Hub é o launcher desktop de jogos da FORJA Game Studio para estações
de eventos ao estilo **Steam Big Picture**, pensado para funcionar em estações
com múltiplos periféricos e sem depender de internet estável.

Este README documenta o que **existe e funciona agora**, não a visão final do produto.

Para operar o Hub numa estação de evento (configuração, Planilha de Catálogo,
mídia no Drive e atalhos), veja [Como usar o FORJA Hub](docs/USO.md).


# Estado atual

O que já está implementado e testado:

- **Catálogo sincronizado com Google Sheets + Drive**: no boot, o main lê a
  aba `JOGOS` da Planilha de Catálogo, valida cada linha com Zod e baixa a
  mídia de cada Jogo da pasta do Drive.
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
  do processo alvo). Ainda não está ligado à interface.

O que **ainda não existe**:

- Tela de detalhes do Jogo (hoje é um placeholder com o título; `Esc` ou o
  botão B do controle volta ao catálogo).
- Botão de jogar: download e extração do `.zip` do Jogo, e o disparo do
  launcher a partir da interface.
- Modo atração, painel do operador (`Ctrl+Shift+O` só troca para um
  placeholder), busca e filtros.
- Analytics de sessão (tempo de jogo, visualizações).
- Empacotamento e instalador testados para Windows (alvo principal).

# Stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) (Sheets + Drive via Service Account) e [Zod](https://zod.dev/) para validar o catálogo
- [Vitest](https://vitest.dev/) para os testes
- [electron-builder](https://www.electron.build/) — empacotamento (ainda não validado em Windows)

# Rodando

**Pré-requisitos:** Node.js 20.19+ ou 22.12+ (exigência do Vite 7; a CI usa
Node 22).

```sh
npm install
cp .env.example .env   # preencha os IDs, veja docs/USO.md
npm run dev
```

Sem essa configuração o Hub abre, mas o sync aborta e a tela mostra o erro
(`CATALOGO_NAO_CONFIGURADO` ou `CREDENCIAL_AUSENTE`). É configuração faltando,
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
│   │   ├── catalog/    # Sync Sheets/Drive, schema, cache, boot, protocolo forja://
│   │   ├── config/     # IDs da Planilha/Drive e handlers IPC de setup/hydrate
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
