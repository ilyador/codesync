# WorkStream

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-black.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-black.svg)](https://react.dev/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Powered-black.svg)](https://claude.ai/)

> Non-blocking streams of async work. Assigned to AI or humans. No Jira. No scrum. Just ship.

## What It Is

A task manager for small teams that work fast and rely heavily on AI. None of the bloat, none of the ceremonies. Just get things done as fast as you can and delegate anything you can -- all controlled from one place.

<img width="1365" height="1048" alt="Screenshot 2026-04-02 at 14 13 22" src="https://github.com/user-attachments/assets/31876ed3-1adf-48b2-8ad0-09930e60f781" />

## AI Workers

Build AI workers with instructions and strict steps. They generate code, documents, images, video -- whatever you need. Output passes between tasks in a stream.

**Example:** A designer designs a landing page, passes it to a copywriter to add text, passes it to a developer to build it. You can add a pause to review the output at any step.

Ships with four workers out of the box:

- **AI Developer** -- plans and implements features
- **AI Bug Hunter** -- analyzes and fixes bugs
- **AI Refactorer** -- restructures code without breaking behavior
- **AI Tester** -- writes test suites following your patterns

Build your own in the visual flow editor. Drag steps, switch models, control what context each step sees. Write shared instructions that shape the worker's behavior. Plug in local LLMs for specialized tasks.

## Self-Deployed

Everything runs on your machine. All code and files stay offline.

- **Solo:** run locally, sync with team members through an online Supabase instance
- **Team:** run on a VPS where your team can access directly

The only dependency is Claude Code. Everything else is included.

## Quick Start

```bash
git clone git@github.com:ilyador/workstream.git
cd workstream && pnpm install && cp .env.example .env
npx supabase start && npx supabase db reset
pnpm dev
```

Opens at `http://localhost:3000`.

## How Streams Work

1. Create a stream -- a sequence of tasks that lead to a deliverable
2. Assign each task to an AI worker or a human
3. Click Run -- tasks execute top-to-bottom, one finishes, next starts
4. Each task auto-commits to the stream's git branch
5. When the stream is done, click Create PR

Each stream gets its own git worktree. Auto-checkpoint before every task, auto-revert on failure. Your main branch is never touched.

## What Else

- **Pause & resume** -- workers pause when stuck, you answer inline
- **Live logs** -- watch AI think in real time, push notifications when done
- **Comments & @mentions** -- discuss work on the task, not in Slack
- **Telegram bot** -- create tasks from your phone
- **MCP server** -- 9 tools for managing from Claude Code CLI
- **RAG** -- local embeddings via LM Studio for doc search in worker context
- **Team roles** -- admin, dev, manager

## Architecture

```
Browser <-> Express API <-> Supabase (Postgres)
                              ^
                          Worker polls for jobs
                              |
                          Claude Code CLI
```

## Tech Stack

**Frontend:** React 19, Vite 8, TypeScript, CSS Modules
**Backend:** Express 5, tsx
**Database:** Supabase (Postgres, Auth, RLS, Realtime)
**AI:** Claude Code CLI, MCP SDK
**Embeddings:** LM Studio (local, optional)

## License

MIT
