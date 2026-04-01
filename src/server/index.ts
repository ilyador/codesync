import 'dotenv/config';
import express from 'express';
import { runChecks } from './onboarding.js';
import { executionRouter } from './routes/execution.js';
import { gitRouter } from './routes/git.js';
import { authRouter } from './routes/auth.js';
import { dataRouter } from './routes/data.js';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json());

// Onboarding
app.get('/api/onboarding', (req, res) => {
  const localPath = req.query.localPath as string | undefined;
  const checks = runChecks(localPath);
  const allRequiredOk = checks.filter(c => c.required).every(c => c.ok);
  res.json({ checks, ready: allRequiredOk });
});

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Auth (signup, signin, signout, me, refresh)
app.use(authRouter);

// Data (projects, tasks, milestones, jobs, comments, notifications, SSE changes)
app.use(dataRouter);

// Execution engine (run, reply, approve, reject, SSE job events)
app.use(executionRouter);

// Git operations (commit, push, pr)
app.use(gitRouter);

app.listen(PORT, () => {
  console.log(`CodeSync server running on port ${PORT}`);
});
