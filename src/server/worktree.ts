import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { gitSync } from './git-utils.js';

/**
 * Ensure a git worktree exists for the given workstream slug.
 * Creates `<projectPath>/.worktrees/<slug>` on branch `workstream/<slug>`.
 * Returns the absolute worktree path.
 */
export function ensureWorktree(projectPath: string, workstreamSlug: string): string {
  const worktreeDir = path.join(projectPath, '.worktrees');
  const worktreePath = path.join(worktreeDir, workstreamSlug);
  const branch = `workstream/${workstreamSlug}`;

  // Already set up — just return the path
  if (existsSync(path.join(worktreePath, '.git'))) {
    return worktreePath;
  }

  // Ensure .worktrees directory exists (recursive avoids TOCTOU race)
  mkdirSync(worktreeDir, { recursive: true });

  // Create the branch if it doesn't exist (based off current HEAD)
  try {
    gitSync(['branch', branch], projectPath);
  } catch {
    // branch already exists — that's fine
  }

  // Create the worktree
  gitSync(['worktree', 'add', worktreePath, branch], projectPath);

  return worktreePath;
}

/**
 * Discard all uncommitted changes in a worktree (staged + unstaged + untracked).
 */
export function resetWorktree(worktreePath: string): void {
  try { gitSync(['checkout', '.'], worktreePath); } catch {}
  try { gitSync(['clean', '-fd'], worktreePath); } catch {}
}

/**
 * Remove a worktree and optionally delete its branch.
 */
export function cleanupWorktree(projectPath: string, workstreamSlug: string): void {
  const worktreePath = path.join(projectPath, '.worktrees', workstreamSlug);
  const branch = `workstream/${workstreamSlug}`;

  // Discard dirty changes so worktree remove doesn't fail
  resetWorktree(worktreePath);

  // Remove the worktree
  try {
    gitSync(['worktree', 'remove', worktreePath, '--force'], projectPath);
  } catch {
    // Worktree may already be gone
  }

  // Delete the local branch (merged into main by now via PR)
  try {
    gitSync(['branch', '-d', branch], projectPath);
  } catch {
    // Branch may not exist or may not be fully merged
  }
}
