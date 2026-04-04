# WorkStream

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-black.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-black.svg)](https://react.dev/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Powered-black.svg)](https://claude.ai/)

> Hire AI workers. Assign them tasks. Review their PRs.

## Your AI Team

WorkStream ships with four AI workers, each specialized for a different job:

| Worker | What it does | Steps |
|--------|-------------|-------|
| **AI Developer** | Plans and implements features | implement -> verify -> review |
| **AI Bug Hunter** | Analyzes and fixes bugs | fix -> verify -> review |
| **AI Refactorer** | Restructures code without breaking behavior | refactor -> verify -> review |
| **AI Tester** | Writes test suites | write-tests -> verify -> review |

Assign a worker to a task the same way you'd assign a teammate. It reads your codebase, does the work, runs tests, and asks you to review. You approve or reject. That's it.

Workers are composable flows -- you can edit their instructions, change which AI model they use per step, control what context they see, and create entirely new ones. The flow editor is a visual builder where each worker's pipeline is a sequence of step cards you can customize.

<img width="1365" height="1048" alt="Screenshot 2026-04-02 at 14 13 22" src="https://github.com/user-attachments/assets/31876ed3-1adf-48b2-8ad0-09930e60f781" />

## How It Works

1. Create a **stream** -- a sequence of tasks that lead to a feature
2. Assign each task to an **AI worker** or a human teammate
3. Click **Run** -- the worker reads your codebase, implements the task, runs tests
4. Each completed task is auto-committed to the stream's branch
5. When the stream is done, click **Create PR**

## Token-Efficient by Design

Each worker step only gets the context it actually needs:

- **Execute step**: CLAUDE.md, task description, skills, images -- full project context
- **Verify step**: just "run the tests" -- ~200 tokens instead of ~15,000
- **Review step**: git diff + architecture docs -- fresh eyes, never saw the implementation

This cuts token usage roughly in half compared to sending everything to every step.

## What Else

- **Pause & resume** -- worker pauses when stuck, you answer inline, it continues
- **Auto-revert** -- git checkpoint before each task, auto-rollback on failure
- **Git worktrees** -- each stream gets its own branch, your main stays clean
- **Human tasks** -- assign to a person for design reviews, QA, manual work
- **Skills** -- type `/skillname` in task descriptions to inject methodologies
- **Realtime** -- watch workers execute live, push notifications when done
- **Telegram bot** -- create tasks and check status from your phone
- **MCP server** -- 9 tools for interacting from Claude Code CLI
- **Team roles** -- admin, dev, manager (managers can't trigger AI execution)

## Two Ways to Run

**Locally** -- run on your machine, sync through Supabase. Good for solo devs.

**On a VPS** -- AI workers grind tasks 24/7 while you sleep. Good for teams.

## Quick Start

```bash
git clone git@github.com:ilyador/workstream.git
cd workstream
pnpm install
cp .env.example .env

npx supabase start
npx supabase db reset

# Fill .env with keys from:
npx supabase status

pnpm dev
```

Opens at `http://localhost:3000`.

## Architecture

```
Browser <-> Express API <-> Supabase (Postgres)
                              ^
                          Worker polls for jobs
                              |
                          Claude Code CLI
```

- **Express server** -- stateless HTTP/SSE, restarts don't affect running jobs
- **Worker process** -- polls DB for queued jobs, spawns `claude -p`, streams logs
- **Supabase** -- auth, DB, RLS policies, realtime (local Docker or cloud)

## Tech Stack

**Frontend:** React 19, Vite 8, TypeScript, CSS Modules
**Backend:** Express 5, tsx
**Database:** Supabase (Postgres, Auth, RLS, Realtime)
**AI:** Claude Code CLI, MCP SDK
**Bot:** grammy (Telegram)

## License

MIT
