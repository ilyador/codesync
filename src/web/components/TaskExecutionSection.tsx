import type { FlowExecutionCapabilities } from '../../shared/flow-execution-capabilities';
import s from './TaskForm.module.css';

interface TaskExecutionSectionProps {
  assignee: string;
  flowCapabilities: FlowExecutionCapabilities | null;
  providerSelectionEnabled: boolean;
  subagentSelectionEnabled: boolean;
  executionSettingsLocked: boolean;
  multiagent: string;
  autoContinue: boolean;
  chaining: string;
  setMultiagent: (value: string) => void;
  setAutoContinue: (value: boolean) => void;
  setChaining: (value: string) => void;
}

export function TaskExecutionSection({
  assignee,
  flowCapabilities,
  providerSelectionEnabled,
  subagentSelectionEnabled,
  executionSettingsLocked,
  multiagent,
  autoContinue,
  chaining,
  setMultiagent,
  setAutoContinue,
  setChaining,
}: TaskExecutionSectionProps) {
  return (
    <>
      <div className={s.checkboxes}>
        {!assignee && providerSelectionEnabled && subagentSelectionEnabled && (
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={multiagent === 'yes'}
              disabled={executionSettingsLocked}
              onChange={event => setMultiagent(event.target.checked ? 'yes' : 'auto')}
            />
            <span>Use subagents</span>
          </label>
        )}
        {!assignee && providerSelectionEnabled && !subagentSelectionEnabled && flowCapabilities && (
          <div className={s.attachmentNotice}>
            {flowCapabilities.subagentsSelectionReason || 'Subagent use is inferred from the assigned flow.'}
          </div>
        )}
        {!assignee && (
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={autoContinue}
              onChange={event => setAutoContinue(event.target.checked)}
            />
            <span>Continue automatically</span>
          </label>
        )}
      </div>

      <div className={s.field}>
        <label className={s.label}>File chaining</label>
        <select className={s.select} value={chaining} onChange={event => setChaining(event.target.value)}>
          <option value="none">None</option>
          <option value="accept">Accept files from previous task</option>
          <option value="produce">Produce files for next task</option>
          <option value="both">Accept and produce files</option>
        </select>
      </div>
    </>
  );
}
