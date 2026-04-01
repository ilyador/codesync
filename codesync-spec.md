# CodeSync — Product Spec

## What It Is

A local-first project management tool for software teams where task types are executable. A local web server runs on each developer's machine, calls Claude Code to execute tasks in phases (analyze → fix → verify → review), and syncs task state between team members via Supabase. The AI never runs autonomously — a human always triggers execution.

## Core Concepts

### Tasks

A task is the only unit of work. No epics, no stories, no subtasks.

```
Task:
  id              string (uuid)
  project_id      string (FK to project)
  title           string
  description     string
  type            string (maps to a task type definition)
  mode            "ai" | "human" (default: "ai")
  effort          "low" | "medium" | "high" | "max" (default: "high")
  multiagent      "auto" | "yes" (default: "auto")
  status          backlog | todo | in_progress | paused | review | done | canceled
  blocked_by      task_id[] (optional)
  assignee        user_id | "ai" | null
  milestone_id    string (optional)
  position        integer (order in backlog, lower = higher priority)
  images          string[] (URLs to uploaded images — screenshots, designs, error captures)
  followup_notes  string (optional — instructions added when sending a task back to backlog)
  created_at      timestamp
  completed_at    timestamp (null until done)
  created_by      user_id
```

No priority field. Position in the list is the priority. Drag to reorder.

No estimate field. Track actual cycle time (created_at → completed_at) instead.

### Task Modes

**AI mode (default):** Task is executable. Clicking "Run" spawns `claude -p` and runs through the phase sequence. The AI reads the task description, images, and any followup notes as context.

**Human mode:** Task is just text + optional images. No "Run" button. It shows in the focus view and backlog like any other task but is completed manually. Status is moved by hand (todo → in_progress → done). For design tasks, planning, meetings, or anything that doesn't make sense for AI to execute.

### Effort Mode

Each AI task has an effort level that maps to Claude Code's `/effort` setting:
- **low** — quick fixes, typos, simple renames
- **medium** — straightforward changes with some context needed
- **high** (default) — deep reasoning, multi-file changes, architectural awareness
- **max** — complex problems requiring maximum capability

The runner passes this to `claude -p` via the `--effort` flag. Default is high because most tasks worth creating are non-trivial. Developers can downgrade to low/medium for simple tasks to save time and subscription usage.

### Multi-Agent Mode

Each AI task has a multi-agent setting:
- **auto** (default) — Claude decides whether to use subagents based on task complexity. Simple single-file fixes run in one session. Multi-file changes may spawn parallel subagents.
- **yes** — Force Claude to use multi-agent execution. The prompt explicitly instructs Claude to dispatch subagents for parallel work. Useful for large tasks that benefit from concurrent analysis/implementation.

This is passed as a prompt instruction, not a CLI flag. When set to "yes", the task prompt includes: "Use subagents to parallelize this work. Dispatch separate agents for independent subtasks."

### Images on Tasks

Tasks can have attached images (screenshots, design mockups, error captures). Stored in Supabase Storage, referenced by URL. When an AI agent executes the task, images are passed to `claude -p` as context — Claude can read images natively. Useful for:
- "This button is misaligned" + screenshot
- "Implement this design" + Figma export
- "This error appears in the browser" + console screenshot

### Sending Tasks Back to Backlog

When a completed or reviewed task isn't right, the human can reject it back to backlog with followup instructions:

```
[ Reject → Backlog ]

"The fix works for the happy path but breaks when the user
has no payment method. Handle that case too."
```

This:
1. Sets status back to `backlog`
2. Stores the followup notes in `followup_notes`
3. Preserves all previous job history (phase outputs, attempts)
4. When Run is triggered again, the AI gets: original description + images + all previous phase outputs + the followup notes
5. The task re-enters the phase sequence from the beginning, but with full context of what was already tried and why it was rejected

### Comments

Tasks have a comment thread. Project members can comment and tag other users with `@name`.

```
Comment:
  id              string (uuid)
  task_id         string (FK to task)
  user_id         string (FK to user)
  body            string (supports @mentions)
  created_at      timestamp
```

Comments are for human discussion only — they are not passed to AI agents. Use the task description and followup notes for AI context.

### Ownership & Notifications

Each task has one owner (the `assignee` field). The owner gets notified when:
- Task status changes (e.g., agent finishes a phase, task moves to review)
- They are tagged in a comment via `@name`
- They are assigned to a task

Notifications are delivered via:
- Web UI (notification badge / indicator in the header)
- Optionally email (if configured via Supabase)

Only the owner gets notifications — not every project member. This prevents noise. If you want someone's attention, tag them in a comment or assign the task to them.

### Projects

Projects are the top-level entity. There is no team concept. A user can belong to multiple projects with different people on each. The UI has a project switcher in the header.

```
Project:
  id              string (uuid)
  name            string (e.g., "HOABot", "EndStream")
  created_by      user_id
  created_at      timestamp

ProjectMember:
  project_id      string (FK to project)
  user_id         string (FK to user)
  role            admin | dev
  local_path      string (per-user — e.g., "/home/sixbox/Dev/hoabot")
  joined_at       timestamp
```

`local_path` is stored per member — each person configures where the repo lives on their machine. Stored in the DB as part of membership, but only used by that user's local server.

Admin can invite others to the project by email. Roles are per-project — you can be admin on HOABot and dev on EndStream.

Tasks, milestones, and task type configs are scoped to a project. Switching projects switches the entire view — focus, jobs, backlog.

### Milestones

A milestone groups tasks toward a version release. Scoped to a project.

```
Milestone:
  id              string (uuid)
  project_id      string (FK to project)
  name            string (e.g., "v1.2")
  deadline        date (optional)
  status          active | completed
  created_at      timestamp
```

A task optionally belongs to a milestone. A milestone's progress is derived from its tasks (12/18 done). No separate tracking.

### Task Types

A task type is an executable specification. It defines which skill/prompt to use, which tools the agent gets, what phases it runs through, and when to pause for a human.

```json
{
  "task_types": {
    "bug-fix": {
      "phases": ["analyze", "fix", "verify"],
      "on_verify_fail": "fix",
      "verify_retries": 2,
      "final": "review",
      "on_review_fail": "fix",
      "review_retries": 1,
      "on_max_retries": "pause",
      "phase_config": {
        "analyze": {
          "skill": "systematic-debugging",
          "tools": ["Read", "Grep", "Bash"],
          "prompt": "prompts/analyze.md",
          "model": "opus"
        },
        "fix": {
          "skill": null,
          "tools": ["Read", "Edit", "Bash"],
          "prompt": "prompts/fix.md",
          "model": "opus"
        },
        "verify": {
          "skill": null,
          "tools": ["Bash", "Read"],
          "prompt": "prompts/verify.md",
          "model": "sonnet"
        },
        "review": {
          "skill": "code-review",
          "tools": ["Read", "Grep"],
          "prompt": "prompts/review.md",
          "model": "opus"
        }
      }
    },
    "feature": {
      "phases": ["implement", "verify"],
      "on_verify_fail": "implement",
      "verify_retries": 2,
      "final": "review",
      "on_review_fail": "implement",
      "review_retries": 1,
      "on_max_retries": "pause",
      "phase_config": {
        "implement": {
          "skill": null,
          "tools": ["Read", "Edit", "Write", "Bash"],
          "prompt": "prompts/implement.md",
          "model": "opus"
        },
        "verify": {
          "skill": null,
          "tools": ["Bash", "Read"],
          "prompt": "prompts/verify.md",
          "model": "sonnet"
        },
        "review": {
          "skill": "code-review",
          "tools": ["Read", "Grep"],
          "prompt": "prompts/review.md",
          "model": "opus"
        }
      }
    },
    "ui-fix": {
      "phases": ["analyze", "fix", "verify"],
      "on_verify_fail": "fix",
      "verify_retries": 2,
      "final": "review",
      "on_review_fail": "fix",
      "review_retries": 1,
      "on_max_retries": "pause",
      "phase_config": {
        "analyze": {
          "skill": "frontend-design",
          "tools": ["Read", "chrome-devtools"],
          "prompt": "prompts/ui-analyze.md",
          "model": "opus"
        },
        "fix": {
          "skill": "frontend-design",
          "tools": ["Read", "Edit", "chrome-devtools"],
          "prompt": "prompts/ui-fix.md",
          "model": "opus"
        },
        "verify": {
          "skill": null,
          "tools": ["Bash", "chrome-devtools"],
          "prompt": "prompts/ui-verify.md",
          "model": "sonnet"
        },
        "review": {
          "skill": "code-review",
          "tools": ["Read", "chrome-devtools"],
          "prompt": "prompts/review.md",
          "model": "opus"
        }
      }
    },
    "refactor": {
      "phases": ["analyze", "refactor", "verify"],
      "on_verify_fail": "refactor",
      "verify_retries": 2,
      "final": "review",
      "on_review_fail": "refactor",
      "review_retries": 1,
      "on_max_retries": "pause",
      "phase_config": {
        "analyze": {
          "skill": null,
          "tools": ["Read", "Grep"],
          "prompt": "prompts/refactor-analyze.md",
          "model": "opus"
        },
        "refactor": {
          "skill": "simplify",
          "tools": ["Read", "Edit", "Bash"],
          "prompt": "prompts/refactor.md",
          "model": "opus"
        },
        "verify": {
          "skill": null,
          "tools": ["Bash", "Read"],
          "prompt": "prompts/verify.md",
          "model": "sonnet"
        },
        "review": {
          "skill": "code-review",
          "tools": ["Read", "Grep"],
          "prompt": "prompts/review.md",
          "model": "opus"
        }
      }
    },
    "test": {
      "phases": ["write-tests", "verify"],
      "on_verify_fail": "write-tests",
      "verify_retries": 2,
      "final": "review",
      "on_review_fail": "write-tests",
      "review_retries": 1,
      "on_max_retries": "pause",
      "phase_config": {
        "write-tests": {
          "skill": "test-driven-development",
          "tools": ["Read", "Write", "Bash"],
          "prompt": "prompts/write-tests.md",
          "model": "opus"
        },
        "verify": {
          "skill": null,
          "tools": ["Bash", "Read"],
          "prompt": "prompts/verify.md",
          "model": "sonnet"
        },
        "review": {
          "skill": "code-review",
          "tools": ["Read", "Grep"],
          "prompt": "prompts/review.md",
          "model": "opus"
        }
      }
    }
  }
}
```

Teams can add custom task types by adding entries to this config and providing the prompt files.

### Phases

Each phase in a task is a fresh `claude -p` invocation. The fixer never reviews its own work. A fresh agent always judges the previous agent's output.

Phase carry-forward: each phase writes a structured output. The next phase receives only that output — not the full conversation history. Outputs are small and specific:

```
Phase: analyze
Output: {
  "root_cause": "express.json() consumes raw body before Stripe signature verification",
  "location": "server/src/index.ts:47",
  "suggested_approach": "Use express.raw() for the webhook route before express.json()"
}

Phase: fix
Input: the analyze output above
Output: {
  "files_changed": ["server/src/index.ts"],
  "diff_summary": "+5 -2 lines",
  "approach_taken": "Added express.raw() middleware for /api/webhooks/stripe route"
}

Phase: verify
Input: the fix output above
Output: {
  "tests_passed": false,
  "failures": ["test/webhook.test.ts: signature validation still fails with mock payload"],
  "diagnosis": "The raw body buffer isn't being passed to constructEvent correctly"
}
```

On verify failure, the fix phase gets: the original analyze output + the verify failure output. It doesn't need to rediscover the problem — it knows what it tried and why it failed.

### Recursive Quality Loop

The phase sequence loops until quality criteria are met or retry limits are hit:

```
analyze → fix → verify ─── pass ──→ review ─── pass ──→ done
                  │                    │
                 fail                 fail
                  │                    │
                  ↓                    ↓
              fix (attempt 2)    fix (with review notes)
                  │                    │
               verify              verify → review
                  │                    │
                 fail                 pass → done
                  │                   fail → pause (max retries)
                  ↓
           fix (attempt 3)
                  │
               verify
                  │
              pass → review
              fail → pause (max retries hit, needs human)
```

Review criteria come from the project's architecture doc:

```json
{
  "review_criteria": {
    "source": "docs/ARCHITECTURE.md",
    "rules": [
      "No direct database calls outside /server/src/routers/",
      "All new endpoints use adminProcedure or authedProcedure",
      "No new dependencies without justification",
      "Files under 300 lines"
    ]
  }
}
```

The review agent checks these specific constraints against the diff. Binary pass/fail per rule, not subjective "is this good."

### Pause/Resume

An agent can pause at any phase boundary by writing a question and exiting:

```
Job state when paused:
{
  "task_id": "bug-123",
  "status": "paused",
  "current_phase": "fix",
  "attempt": 2,
  "question": "The webhook handler has two paths. Which one is failing?",
  "completed_phases": [
    { "phase": "analyze", "output": { ... } },
    { "phase": "fix", "attempt": 1, "output": { ... } },
    { "phase": "verify", "attempt": 1, "output": { ... } }
  ]
}
```

The human answers from the web UI (inline reply in the jobs panel) or from Claude Code via the MCP server. The answer is written to the job state. Next time the human triggers the task, the runner spawns a fresh agent with: the completed phase outputs + the human's answer. The agent continues from where it stopped.

No process stays alive waiting for a reply. The agent asks, exits, gets reborn with context.

Guardrails for when to pause vs proceed:

| Situation | Behavior |
|---|---|
| Clear bug with obvious fix | Fix, verify, flag for review |
| Ambiguous requirements | Pause, ask question |
| Fix changes a public API | Pause, explain impact, ask for approval |
| Tests still failing after max retries | Pause, report what was tried |
| Multiple valid approaches | Pause, present options with tradeoffs |

These rules are in the phase prompts, not in framework code. Different task types can have different pause thresholds.

## Architecture

### Local Server (runs on each developer's machine)

```
npx codesync
  → starts localhost:3000
  → Express server:
      - serves React web UI
      - exposes tRPC API
      - spawns claude -p for task execution
      - reads/writes local project files
      - runs tests via bash
      - connects to Supabase for task/team state sync
```

### What Runs Locally (never leaves the machine)

- Claude Code sessions (claude -p)
- Code reading, editing, test running
- Browser testing via Chrome DevTools MCP
- Git operations

### What Syncs via Database

- Projects (id, name, team_id)
- Tasks (id, project_id, title, description, type, mode, effort, status, position, blocked_by, assignee, milestone_id, images, followup_notes, timestamps)
- Milestones (id, project_id, name, deadline, status)
- Job outcomes (task_id, phase outputs, status, diff summaries — NOT code, NOT full diffs)
- Pause questions and human answers
- Team members and roles

Code and diffs never leave the developer's machine. The shared DB holds task metadata and structured outputs only.

### Database Options

**Development / solo use:** Local Postgres. No auth, no realtime, simplest setup.

**Team use (self-hosted):** Self-hosted Supabase via Docker on a team machine. Provides Postgres + Auth (GoTrue) + Realtime + Storage (for task images). Team members connect via port forwarding or Cloudflare Tunnel. Requirements: 2+ CPU cores, 4 GB RAM. Tested on: i7-6800K (12 threads), 78 GB RAM, 712 GB disk — handles it easily alongside full development workload.

**Team use (hosted):** Supabase cloud. Zero infrastructure. Free tier covers small teams. Swap the connection string — same schema, zero code changes.

All three options use the same Postgres schema. The choice is a deployment decision, not an architecture decision.

### Realtime Sync

Task status changes sync in realtime across team members (requires Supabase — self-hosted or cloud). When one developer's agent completes a phase or pauses, other team members see it instantly in their UI.

## Auth & Membership

### Authentication

Supabase Auth with email/password. No social login needed for v1.

### Roles (per project)

- **Admin**: can invite/remove members, manage milestones, configure task types
- **Dev**: can create tasks, trigger execution, reorder backlog, respond to paused tasks, approve reviews

A user can have different roles on different projects.

### Invites

Project admin enters email → invite sent → recipient creates account (or logs in if they already have one) → joins project. A user can be invited to multiple projects by different people.

## Web UI

### Focus View (default, top of page)

One task. The most impactful thing to do right now.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Fix Stripe webhook handler                     │
│                                                 │
│  WHY: 3 tasks blocked. CI red for 6 hours.      │
│  TYPE: bug-fix                                  │
│  MILESTONE: v1.2 (due April 15)                 │
│                                                 │
│  [ Run ]  [ Not this — tell me why ]   mode: AI  │
│                                                 │
│  Next: Add unit invite email template           │
│  Then: Homeowner portal violation view          │
│                                                 │
└─────────────────────────────────────────────────┘
```

The focus task is computed from:
- What unblocks the most other work (blocker graph)
- What's closest to milestone deadline and not started
- What was recently broken (failing CI)
- Backlog position (human-set priority as tiebreaker)

"Not this" lets you skip with a reason. The system recalculates and shows the next best option.

"Run" starts phase 1 of the task type. The task moves to the Jobs panel.

### Jobs Panel (middle of page)

All active, paused, and recently completed work.

```
┌─────────────────────────────────────────────────┐
│  JOBS                          filter: all ▾    │
│                                                 │
│  ● RUNNING  Refactor auth middleware            │
│    Phase: fix (attempt 2/3) · 2 min elapsed     │
│    ▸ [live log]                                 │
│                                                 │
│  ⏸ PAUSED  Add PDF export to invoices           │
│    "Should PDFs include late fees or base only?" │
│    [ reply input                      ] [Send]  │
│                                                 │
│  ✓ REVIEW  Migrate user table to UUID           │
│    3 files changed · tests pass                 │
│    review: "No issues found"                    │
│    [ Approve ▾ ] [ Reject → Backlog with note ] │
│      ├ Commit                                   │
│      ├ Commit + Push                            │
│      └ New Branch + PR                          │
│                                                 │
│  ✓ DONE  Fix login redirect loop · 20 min ago   │
│  ✓ DONE  Add dark mode toggle · 1 hr ago        │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **Running**: shows current phase, attempt number, elapsed time, expandable live log
- **Paused**: shows the question, inline reply input — answer without leaving the page
- **Review**: shows summary, file count, test status, review outcome. Approve or reject inline
- **Done**: collapsed, shows title + completion time

### Backlog (bottom of page)

Ordered list of all tasks not currently in progress. Filtered by milestone.

```
┌─────────────────────────────────────────────────┐
│  BACKLOG                  Milestone: v1.2 ▾     │
│                                                 │
│  ○ Homeowner portal violation view    ui-fix    │
│  ○ Email receipt on payment           feature   │
│  ○ Add unit invite email template     feature   │
│  ○ Refactor ViolationsPage            refactor  │
│  ○ Write tests for members router     test      │
│                                                 │
│  drag to reorder · position = priority          │
│                                                 │
└─────────────────────────────────────────────────┘
```

Drag to reorder. Position is the only priority mechanism. The focus view reads this order but can override based on blockers and urgency — and tells you why.

## API / MCP Server

The local server exposes an API that Claude Code can call via an MCP server. This lets developers interact with CodeSync from the CLI without opening the web UI.

### Endpoints

```
GET  /api/focus              → current top task + why
GET  /api/summary            → full project state as LLM-readable markdown
GET  /api/milestone/:id      → progress, blockers, remaining tasks
GET  /api/tasks              → all tasks, filterable by status/milestone/type
GET  /api/tasks/:id          → single task with job history
GET  /api/jobs               → running, paused, review, recent done
POST /api/tasks              → create task
PATCH /api/tasks/:id         → update task (status, position, assignee, etc.)
POST /api/tasks/:id/run      → trigger execution (starts phase 1)
POST /api/jobs/:id/reply     → answer a paused job's question
POST /api/jobs/:id/approve   → approve a review
POST /api/jobs/:id/reject    → reject a review with note
```

### MCP Tools (for Claude Code)

```
project_focus()                    → current top task + why
project_summary()                  → full state as markdown
task_create(title, type, milestone)→ create task
task_update(id, status)            → update task
task_log(id, message)              → add note to task
milestone_status(id)               → progress, blockers
job_reply(id, answer)              → answer paused job
job_approve(id)                    → approve review
job_reject(id, note)               → reject review
```

### Summary Endpoint Format

`GET /api/summary` returns structured markdown for LLM consumption:

```markdown
# Project: HOABot v1.2

## Focus Right Now
Fix Stripe webhook handler (blocks 3 tasks)

## Milestone Progress
12/18 tasks done. 6 remaining. Deadline: April 15.

## Blocked
- Add invoice PDF export (blocked by: Stripe webhook fix)
- Email receipt on payment (blocked by: Stripe webhook fix)

## Jobs
- RUNNING: Refactor auth middleware (phase: fix, attempt 2/3)
- PAUSED: Add PDF export ("Should PDFs include late fees?")
- REVIEW: Migrate user table to UUID (3 files, tests pass)

## Recently Completed
- Fix login redirect loop (20 min ago)
- Add dark mode toggle (1 hr ago)

## Backlog (top 5)
1. Homeowner portal violation view (ui-fix)
2. Email receipt on payment (feature)
3. Add unit invite email template (feature)
4. Refactor ViolationsPage (refactor)
5. Write tests for members router (test)
```

## Execution Flow

When a human clicks "Run" on a task:

```
1. Local server reads task type config
2. Reads phase 1 config (skill, tools, prompt, model)
3. Builds the claude -p command:
   - Injects: task description + images + followup notes (if any) + previous phase outputs (if re-run) + prompt + review criteria + project context
   - Sets: allowed tools from phase config
   - Sets: max turns (10-15 per phase)
4. Spawns claude -p as child process
5. Streams stdout to the Jobs panel (live log)
6. On exit: reads structured output from a known file path
7. Updates job state in Supabase (phase complete, output saved)
8. Checks: did the phase pass or fail?
   - Pass → advance to next phase → spawn next claude -p
   - Fail → check retry count → retry or pause
   - Pause → write question to job state, stop
   - Final phase pass → move task to "review" status
9. On review approve → prompt git action:
      - **Commit** — commits changes to current branch with auto-generated message referencing the task
      - **Commit + Push** — commits and pushes to current branch
      - **New Branch + PR** — creates a branch (e.g., `codesync/bug-123-fix-stripe-webhook`), commits, pushes, opens a PR with the task description and phase outputs as the PR body
   On review reject → task goes back to backlog with followup notes, preserving all job history
```

The git action runs locally via bash — it's the last step after approve, before the task moves to done. The commit message includes the task ID and title. The PR body includes the task description, what was analyzed, what was changed, and test results.

All execution is triggered by the human clicking Run or Approve/Reject. The phase progression within a single Run is automatic (analyze flows into fix flows into verify) but the initial trigger is always manual.

## Project Configuration

Each project has a `.codesync/` directory:

```
.codesync/
  config.json           # task types, review criteria, team settings
  prompts/
    analyze.md          # prompt for analyze phase
    fix.md              # prompt for fix phase
    verify.md           # prompt for verify phase
    review.md           # prompt for review phase
    implement.md        # prompt for feature implement phase
    write-tests.md      # prompt for test writing phase
    ui-analyze.md       # prompt for UI analysis
    ui-fix.md           # prompt for UI fix
    ui-verify.md        # prompt for UI verification
    refactor-analyze.md # prompt for refactor analysis
    refactor.md         # prompt for refactor execution
```

This directory is checked into git. The prompts and task types are version-controlled alongside the code.

## What This Is NOT

- Not autonomous. Human triggers every task execution.
- Not a CI/CD tool. It doesn't watch for pushes or run on merge.
- Not a chat interface. The pause/reply mechanism is for specific questions, not open conversation.
- Not Jira. No epics, no story points, no sprints, no custom fields, no velocity tracking.
- No priority dropdowns. Position in the list is the priority.
- No estimate fields. Track actual cycle time instead.
- No subtasks. If a task is too big, split it into real tasks.
- No labels or components. Task types handle categorization.
