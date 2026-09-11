> [!CAUTION]
> **Este projeto está em desenvolvimento ativo e não é utilizável em produção.**
> A reescrita está em andamento in-place: funcionalidades descritas abaixo
> podem estar parcialmente implementadas, atrás de stubs, ou ainda não
> existirem. Veja [Estado atual](#estado-atual) antes de assumir qualquer
> comportamento.

-----

<div align="center">

# FORJA Hub

[Rodando](#rodando) • [Estado atual](#estado-atual) • [Estrutura](#estrutura-do-projeto) • [Contribuir](#contribuir)

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
- [Estrutura do projeto](#estrutura-do-projeto)
- [Contribuir](#contribuir)


# Introdução

O FORJA Hub é o launcher desktop de jogos da FORJA Game Studio para estações
de eventos ao estilo **Steam Big Picture**, pensado para funcionar em estações
com múltiplos periféricos e sem depender de internet estável.

Este README documenta o que **existe e funciona agora**, não a visão final do produto.


# Estado atual

O que já está implementado e testado:

- **Setup de estação**: tela inicial de configuração (`SetupScreen`) e
  handlers no processo main para hidratar e persistir a config da estação,
  com escrita atômica em disco.
- **Base de input**: captura de teclado e gamepad (XInput) no renderer, com
  guarda para não interceptar teclas quando um elemento editável está
  focado.
- **Launcher de processo**: probe inicial para abrir e monitorar
  executáveis locais.
- **Atalhos globais**: registro de global shortcuts no main, com fallback
  via `before-input-event` (necessário em dev no Linux/Wayland, onde
  `globalShortcut` não registra em compositores como o Hyprland).

O que **ainda não existe**:

- Catálogo de jogos (grade, busca, filtros, tela de detalhes).
- Sincronização com a planilha/fonte de dados remota.
- Analytics de sessão (tempo de jogo, visualizações).
- Modo kiosk / fullscreen de produção.
- Empacotamento e instalador testados para Windows (alvo principal. O
  desenvolvimento roda em Linux, e qualquer fluxo baseado em `tasklist`
  falha em silêncio fora do Windows).

# Stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [electron-builder](https://www.electron.build/) — empacotamento (ainda não validado em Windows)

# Rodando

**Pré-requisitos:** Node.js 18+

```sh
npm install
npm run dev
```

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

- `npm run test`: roda os testes (vitest).
- `npm run build`: typecheck + build de produção via electron-vite.
- `npm run build:win` / `build:mac` / `build:linux`: empacotamento via electron-builder (Windows é o alvo real; os demais não foram validados em estação de evento).

O desenvolvimento acontece em Linux, mas o alvo principal é Windows, a
maioria dos jogos distribuídos pela FORJA é Windows-only. Qualquer rodada em
Linux precisa ser testada de propósito; comportamento dependente de
`tasklist` (detecção de fechamento do executável, tempo de sessão) não tem
equivalente e falha silenciosamente fora do Windows.


# Estrutura do projeto

```
ForjaHUB/
├── src/
│   ├── main/           # Processo principal (config, launcher, atalhos)
│   ├── preload/        # contextBridge / ponte forjaAPI
│   ├── renderer/src/   # Interface React (telas, input, state)
│   └── shared/         # Tipos, canais IPC e normalização compartilhados
├── resources/          # Assets estáticos
└── build/              # Configuração de empacotamento
```

# Contribuir

- Nunca commitamos direto na `main`. Todo trabalho vai em branches.
- Commits são atômicos (um por mudança lógica).
- Rode `npm run lint` e `npm run typecheck` antes de abrir um PR. Isso é
  reforçado automaticamente: o hook `pre-push` bloqueia o push se algum dos
  dois falhar, e a [CI](.github/workflows/ci.yml) roda a mesma checagem em
  cada push de branch e PR para a `main`.

Uso interno — FORJA Game Studio / CESAR.
