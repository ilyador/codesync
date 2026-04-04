import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Flow, FlowStep } from '../lib/api';
import { MdField } from './MdField';
import { BUILT_IN_TYPES, ALL_TOOLS, ALL_CONTEXT_SOURCES, MODEL_OPTIONS, ON_MAX_RETRIES_OPTIONS } from '../lib/constants';
import s from './FlowEditor.module.css';

interface FlowEditorProps {
  flows: Flow[];
  onSave: (flowId: string, updates: { name?: string; description?: string; agents_md?: string; default_types?: string[]; position?: number }) => Promise<void>;
  onSaveSteps: (flowId: string, steps: any[]) => Promise<void>;
  onCreateFlow: (data: { project_id: string; name: string; description?: string; steps?: any[] }) => Promise<Flow>;
  onDeleteFlow: (flowId: string) => Promise<void>;
  projectId: string;
  taskTypes?: string[];
}

function makeBlankStep(position: number): FlowStep {
  return {
    id: `new-${Date.now()}-${position}`,
    name: '',
    position,
    instructions: '',
    model: 'sonnet',
    tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
    context_sources: ['claude_md', 'task_description'],
    is_gate: false,
    on_fail_jump_to: null,
    max_retries: 1,
    on_max_retries: 'pause',
    include_agents_md: true,
  };
}

function cloneSteps(steps: FlowStep[]): FlowStep[] {
  return steps.map(st => ({
    ...st,
    tools: [...st.tools],
    context_sources: [...st.context_sources],
  }));
}

/* ─── Per-column state hook ─── */
function useFlowColumnState(flow: Flow) {
  const [editName, setEditName] = useState(flow.name);
  const [editAgentsMd, setEditAgentsMd] = useState(flow.agents_md ?? '');
  const [editSteps, setEditSteps] = useState<FlowStep[]>(
    cloneSteps(flow.flow_steps.sort((a, b) => a.position - b.position))
  );
  const [editingStepIdx, setEditingStepIdx] = useState<number | null>(null);
  const [agentsMdOpen, setAgentsMdOpen] = useState(!!flow.agents_md);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    setEditName(flow.name);
    setEditAgentsMd(flow.agents_md ?? '');
    setEditSteps(cloneSteps(flow.flow_steps.sort((a, b) => a.position - b.position)));
    setAgentsMdOpen(!!flow.agents_md);
    setError('');
  }, [flow.id, flow.name, flow.agents_md, flow.flow_steps]);

  return {
    editName, setEditName,
    editAgentsMd, setEditAgentsMd,
    editSteps, setEditSteps,
    editingStepIdx, setEditingStepIdx,
    agentsMdOpen, setAgentsMdOpen,
    saving, setSaving,
    error, setError,
    editing, setEditing,
    dragIdx, setDragIdx,
    dragOverIdx, setDragOverIdx,
  };
}

/* ─── Step edit modal ─── */
function StepModal({
  step,
  idx,
  allSteps,
  onUpdate,
  onToggleTool,
  onToggleContext,
  onDelete,
  onClose,
}: {
  step: FlowStep;
  idx: number;
  allSteps: FlowStep[];
  onUpdate: (patch: Partial<FlowStep>) => void;
  onToggleTool: (tool: string) => void;
  onToggleContext: (src: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.stepModal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <h2 className={s.modalHeading}>Step {idx + 1}{step.name ? `: ${step.name}` : ''}</h2>
          <button className={s.modalClose} onClick={onClose}>&times;</button>
        </div>

        <div className={s.modalBody}>
          {/* Name */}
          <div className={s.field}>
            <label className={s.label}>Name</label>
            <input
              className={s.input}
              value={step.name}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder={`Step ${idx + 1}`}
              autoFocus
            />
          </div>

          {/* Instructions */}
          <div className={s.field}>
            <label className={s.label}>Instructions</label>
            <MdField
              value={step.instructions}
              onChange={val => onUpdate({ instructions: val })}
              placeholder="What should the AI do in this step..."
            />
          </div>

          {/* Model */}
          <div className={s.field}>
            <label className={s.label}>Model</label>
            <div className={s.segmented}>
              {MODEL_OPTIONS.map(m => (
                <button
                  key={m}
                  type="button"
                  className={`${s.segmentedBtn} ${step.model === m ? s.segmentedActive : ''}`}
                  onClick={() => onUpdate({ model: m })}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tools */}
          <div className={s.field}>
            <label className={s.label}>Tools</label>
            <div className={s.checkboxGrid}>
              {ALL_TOOLS.map(tool => (
                <label key={tool} className={s.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={step.tools.includes(tool)}
                    onChange={() => onToggleTool(tool)}
                  />
                  {tool}
                </label>
              ))}
            </div>
          </div>

          {/* Context Sources */}
          <div className={s.field}>
            <label className={s.label}>Context Sources</label>
            <div className={s.chipGrid}>
              {ALL_CONTEXT_SOURCES.map(src => (
                <button
                  key={src}
                  type="button"
                  className={`${s.chip} ${step.context_sources.includes(src) ? s.chipActive : ''}`}
                  onClick={() => onToggleContext(src)}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          {/* Gate toggle */}
          <div className={s.row}>
            <label className={s.checkboxLabel}>
              <input
                type="checkbox"
                checked={step.is_gate}
                onChange={e => onUpdate({ is_gate: e.target.checked })}
              />
              Gate step (pass/fail verdict)
            </label>
          </div>

          {/* Gate config */}
          {step.is_gate && (
            <div className={s.gateSection}>
              <div className={s.gateRow}>
                <div className={s.field}>
                  <label className={s.label}>On fail jump to</label>
                  <select
                    className={s.select}
                    value={step.on_fail_jump_to ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      onUpdate({ on_fail_jump_to: v === '' ? null : Number(v) });
                    }}
                  >
                    <option value="">None</option>
                    {allSteps.map((_, i) => (
                      i !== idx && <option key={i} value={i + 1}>Step {i + 1}{allSteps[i].name ? ` - ${allSteps[i].name}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Max retries</label>
                  <input
                    className={s.input}
                    type="number"
                    min={0}
                    max={10}
                    value={step.max_retries}
                    onChange={e => onUpdate({ max_retries: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>On max retries</label>
                  <select
                    className={s.select}
                    value={step.on_max_retries}
                    onChange={e => onUpdate({ on_max_retries: e.target.value })}
                  >
                    {ON_MAX_RETRIES_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Include agents.md toggle */}
          <div className={s.row}>
            <label className={s.checkboxLabel}>
              <input
                type="checkbox"
                checked={step.include_agents_md}
                onChange={e => onUpdate({ include_agents_md: e.target.checked })}
              />
              Include agents.md context
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className={s.modalFooter}>
          <button
            className="btn btnDanger btnSm"
            type="button"
            onClick={onDelete}
          >
            Delete step
          </button>
          <button className="btn btnPrimary btnSm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ─── FlowColumn: one flow rendered as a column ─── */
function FlowColumn({
  flow,
  onSave,
  onSaveSteps,
  onDeleteFlow,
  allFlows,
  taskTypes = BUILT_IN_TYPES,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDragEnd,
  onColumnDrop,
  showDropLeft,
  showDropRight,
}: {
  flow: Flow;
  onSave: FlowEditorProps['onSave'];
  onSaveSteps: FlowEditorProps['onSaveSteps'];
  onDeleteFlow: FlowEditorProps['onDeleteFlow'];
  allFlows: Flow[];
  taskTypes?: string[];
  onColumnDragStart: (flowId: string) => void;
  onColumnDragOver: (e: React.DragEvent, flowId: string) => void;
  onColumnDragEnd: () => void;
  onColumnDrop: (targetFlowId: string) => void;
  showDropLeft: boolean;
  showDropRight: boolean;
}) {
  const state = useFlowColumnState(flow);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.editing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [state.editing]);

  // ---- Step mutations ----
  const updateStep = useCallback((idx: number, patch: Partial<FlowStep>) => {
    state.setEditSteps(prev => prev.map((st, i) => i === idx ? { ...st, ...patch } : st));
  }, [state.setEditSteps]);

  const toggleTool = useCallback((idx: number, tool: string) => {
    state.setEditSteps(prev => prev.map((st, i) => {
      if (i !== idx) return st;
      const has = st.tools.includes(tool);
      return { ...st, tools: has ? st.tools.filter(t => t !== tool) : [...st.tools, tool] };
    }));
  }, [state.setEditSteps]);

  const toggleContextSource = useCallback((idx: number, src: string) => {
    state.setEditSteps(prev => prev.map((st, i) => {
      if (i !== idx) return st;
      const has = st.context_sources.includes(src);
      return { ...st, context_sources: has ? st.context_sources.filter(c => c !== src) : [...st.context_sources, src] };
    }));
  }, [state.setEditSteps]);

  const addStep = useCallback(() => {
    const newIdx = state.editSteps.length;
    state.setEditSteps(prev => [...prev, makeBlankStep(prev.length + 1)]);
    state.setEditingStepIdx(newIdx);
  }, [state.editSteps.length, state.setEditSteps, state.setEditingStepIdx]);

  const deleteStep = useCallback((idx: number) => {
    state.setEditSteps(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((st, i) => ({ ...st, position: i + 1 }));
    });
    state.setEditingStepIdx(null);
  }, [state.setEditSteps, state.setEditingStepIdx]);

  // ---- Step drag reorder ----
  const handleDragStart = useCallback((idx: number) => {
    state.setDragIdx(idx);
  }, [state.setDragIdx]);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    state.setDragOverIdx(idx);
  }, [state.setDragOverIdx]);

  const handleDragEnd = useCallback(() => {
    if (state.dragIdx !== null && state.dragOverIdx !== null && state.dragIdx !== state.dragOverIdx) {
      state.setEditSteps(prev => {
        const next = [...prev];
        const [moved] = next.splice(state.dragIdx!, 1);
        next.splice(state.dragOverIdx!, 0, moved);
        return next.map((st, i) => ({ ...st, position: i + 1 }));
      });
    }
    state.setDragIdx(null);
    state.setDragOverIdx(null);
  }, [state.dragIdx, state.dragOverIdx, state.setEditSteps, state.setDragIdx, state.setDragOverIdx]);

  // ---- Dirty detection ----
  const isDirty = useMemo(() => {
    if (state.editName !== flow.name) return true;
    if (state.editAgentsMd !== (flow.agents_md ?? '')) return true;
    const origSteps = flow.flow_steps.slice().sort((a, b) => a.position - b.position);
    if (state.editSteps.length !== origSteps.length) return true;
    for (let i = 0; i < state.editSteps.length; i++) {
      const e = state.editSteps[i], o = origSteps[i];
      if (!o) return true;
      if (e.name !== o.name || e.instructions !== o.instructions || e.model !== o.model
        || e.is_gate !== o.is_gate || e.max_retries !== o.max_retries
        || e.on_max_retries !== o.on_max_retries
        || e.on_fail_jump_to !== o.on_fail_jump_to
        || JSON.stringify(e.tools) !== JSON.stringify(o.tools)
        || JSON.stringify(e.context_sources) !== JSON.stringify(o.context_sources)) return true;
    }
    return false;
  }, [state.editName, state.editAgentsMd, state.editSteps, flow]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    state.setSaving(true);
    state.setError('');
    try {
      await onSave(flow.id, {
        name: state.editName.trim() || flow.name,
        agents_md: state.editAgentsMd,
      });
      const stepsPayload = state.editSteps.map((st, i) => ({
        name: st.name.trim() || `Step ${i + 1}`,
        position: i + 1,
        instructions: st.instructions,
        model: st.model,
        tools: st.tools,
        context_sources: st.context_sources,
        is_gate: st.is_gate,
        on_fail_jump_to: st.is_gate ? st.on_fail_jump_to : null,
        max_retries: st.is_gate ? st.max_retries : 0,
        on_max_retries: st.is_gate ? st.on_max_retries : 'pause',
        include_agents_md: st.include_agents_md,
      }));
      await onSaveSteps(flow.id, stepsPayload);
    } catch (err: any) {
      state.setError(err.message || 'Failed to save flow');
    } finally {
      state.setSaving(false);
    }
  }, [flow.id, flow.name, state.editName, state.editAgentsMd, state.editSteps, onSave, onSaveSteps, state.setSaving, state.setError]);

  const handleDeleteFlow = useCallback(async () => {
    if (!confirm(`Delete flow "${flow.name}" and all its steps? This cannot be undone.`)) return;
    state.setSaving(true);
    state.setError('');
    try {
      await onDeleteFlow(flow.id);
    } catch (err: any) {
      state.setError(err.message || 'Failed to delete flow');
      state.setSaving(false);
    }
  }, [flow.id, flow.name, onDeleteFlow, state.setSaving, state.setError]);

  const handleRename = useCallback(async () => {
    const trimmed = state.editName.trim();
    if (!trimmed) {
      state.setEditName(flow.name);
    } else if (trimmed !== flow.name) {
      try {
        await onSave(flow.id, { name: trimmed });
      } catch (err: any) {
        state.setError(err.message || 'Failed to rename');
        state.setEditName(flow.name);
      }
    }
    state.setEditing(false);
  }, [state.editName, flow.id, flow.name, state.setEditName, state.setEditing, state.setError, onSave]);

  const colDragCountRef = useRef(0);

  return (
    <div className={s.columnOuter}>
      {showDropLeft && <div className={s.columnDropLine} />}
      <div
        className={s.column}
        onDragOver={e => onColumnDragOver(e, flow.id)}
        onDragEnter={() => { colDragCountRef.current++; }}
        onDragLeave={() => { colDragCountRef.current--; }}
        onDrop={e => { e.preventDefault(); onColumnDrop(flow.id); colDragCountRef.current = 0; }}
      >
        {/* Header */}
        <div className={s.headerWrap}>
          <div className={s.header}>
            <span
              className={s.handle}
              draggable
              onDragStart={e => {
                e.stopPropagation();
                const ghost = document.createElement('div');
                ghost.textContent = state.editName || flow.name;
                ghost.style.cssText = 'padding:6px 16px;background:var(--text);color:var(--bg);border-radius:20px;font-size:13px;font-weight:600;position:fixed;top:-9999px;pointer-events:none;';
                ghost.id = '__flow-drag-preview__';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
                e.dataTransfer.effectAllowed = 'move';
                onColumnDragStart(flow.id);
              }}
              onDragEnd={() => {
                document.getElementById('__flow-drag-preview__')?.remove();
                onColumnDragEnd();
              }}
              onClick={e => e.stopPropagation()}
              title="Drag to reorder flow"
            >&#8942;&#8942;</span>

            {state.editing ? (
              <input
                ref={nameInputRef}
                className={s.nameInput}
                value={state.editName}
                onChange={e => state.setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') {
                    state.setEditName(flow.name);
                    state.setEditing(false);
                  }
                }}
              />
            ) : (
              <span
                className={s.name}
                onDoubleClick={() => {
                  state.setEditName(flow.name);
                  state.setEditing(true);
                }}
                title="Double-click to rename"
              >
                {state.editName || flow.name}
              </span>
            )}

            <select
              className={s.typeSelect}
              value=""
              onChange={e => {
                const type = e.target.value;
                if (!type) return;
                const current = flow.default_types || [];
                const updated = current.includes(type)
                  ? current.filter(t => t !== type)
                  : [...current, type];
                onSave(flow.id, { default_types: updated });
              }}
              title="Default task types for this flow"
            >
              <option value="">{(flow.default_types || []).length > 0 ? (flow.default_types || []).join(', ') : 'types'}</option>
              {taskTypes.map(t => {
                const ownedByOther = allFlows.some(f => f.id !== flow.id && (f.default_types || []).includes(t));
                const owned = (flow.default_types || []).includes(t);
                return (
                  <option key={t} value={t} disabled={ownedByOther}>
                    {owned ? '\u2713 ' : ''}{t}{ownedByOther ? ' (other flow)' : ''}
                  </option>
                );
              })}
            </select>

            <span className={s.stepCount}>
              {state.editSteps.length} {state.editSteps.length === 1 ? 'step' : 'steps'}
            </span>

            <button
              className={s.addBtn}
              onClick={addStep}
              title="Add step"
            >+</button>

            {state.saving && <span className={s.savingText}>Saving...</span>}

            {isDirty && (
              <button
                className={s.saveBtn}
                onClick={handleSave}
                disabled={state.saving}
                title="Save flow"
              >
                Save
              </button>
            )}

            <button
              className={`${s.actionBtn} ${s.actionBtnDanger}`}
              onClick={handleDeleteFlow}
              disabled={state.saving}
              title="Delete flow"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Agents.md collapsible section */}
        <div className={s.agentsMdSection}>
          <button
            className={s.sectionToggle}
            onClick={() => state.setAgentsMdOpen(v => !v)}
            type="button"
          >
            <span className={`${s.sectionArrow} ${state.agentsMdOpen ? s.sectionArrowOpen : ''}`}>&#9654;</span>
            agents.md
            {state.editAgentsMd && !state.agentsMdOpen && (
              <span className={s.sectionHint}>(has content)</span>
            )}
          </button>
          {state.agentsMdOpen && (
            <div className={s.agentsMdBody}>
              <MdField
                value={state.editAgentsMd}
                onChange={val => state.setEditAgentsMd(val)}
                placeholder="Shared instructions for all steps in this flow (markdown)..."
              />
            </div>
          )}
        </div>

        {/* Step cards */}
        <div className={s.steps}>
          {state.editSteps.length === 0 && (
            <div className={s.empty}>No steps yet</div>
          )}
          {state.editSteps.map((step, idx) => (
            <div
              key={step.id}
              className={`${s.stepCard} ${state.dragIdx === idx ? s.stepCardDragging : ''} ${state.dragOverIdx === idx && state.dragIdx !== idx ? s.stepCardDragOver : ''}`}
              onDragOver={e => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => state.setEditingStepIdx(idx)}
            >
              <div className={s.stepCompact}>
                <span
                  className={s.dragHandle}
                  draggable
                  onDragStart={e => { e.stopPropagation(); handleDragStart(idx); }}
                  onClick={e => e.stopPropagation()}
                  title="Drag to reorder"
                >&#8942;&#8942;</span>
                <span className={s.stepName}>{step.name || `Step ${idx + 1}`}</span>
                <div className={s.stepTags}>
                  <span className={`${s.stepTag} ${step.model === 'opus' ? s.modelOpus : s.modelSonnet}`}>
                    {step.model}
                  </span>
                  {step.is_gate && <span className={`${s.stepTag} ${s.gateTag}`}>gate</span>}
                  <span className={`${s.stepTag} ${s.toolsTag}`}>{step.tools.length} tools</span>
                </div>
              </div>
              {step.instructions && (
                <div className={s.stepPreview}>
                  {step.instructions.slice(0, 200)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        {state.error && <div className={s.error}>{state.error}</div>}

        {/* Step edit modal */}
        {state.editingStepIdx !== null && state.editSteps[state.editingStepIdx] && (
          <StepModal
            step={state.editSteps[state.editingStepIdx]}
            idx={state.editingStepIdx}
            allSteps={state.editSteps}
            onUpdate={patch => updateStep(state.editingStepIdx!, patch)}
            onToggleTool={tool => toggleTool(state.editingStepIdx!, tool)}
            onToggleContext={src => toggleContextSource(state.editingStepIdx!, src)}
            onDelete={() => deleteStep(state.editingStepIdx!)}
            onClose={() => state.setEditingStepIdx(null)}
          />
        )}
      </div>
      {showDropRight && <div className={s.columnDropLine} />}
    </div>
  );
}

/* ─── FlowEditor: Board container ─── */
export function FlowEditor({ flows, onSave, onSaveSteps, onCreateFlow, onDeleteFlow, projectId, taskTypes }: FlowEditorProps) {
  const [creating, setCreating] = useState(false);
  const [draggedFlowId, setDraggedFlowId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);

  const handleNewFlow = useCallback(async () => {
    setCreating(true);
    try {
      const maxPos = flows.length > 0 ? Math.max(...flows.map(f => f.position ?? 0)) : 0;
      await onCreateFlow({ project_id: projectId, name: 'New Flow', description: '', steps: [] });
      // Position will be set by the server default or we patch it after
    } catch (err: any) {
      console.error('Failed to create flow:', err);
    } finally {
      setCreating(false);
    }
  }, [projectId, flows, onCreateFlow]);

  const handleColumnDragStart = useCallback((flowId: string) => {
    setDraggedFlowId(flowId);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    if (!draggedFlowId || targetId === draggedFlowId) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    setDropTargetId(targetId);
    setDropSide(side);
  }, [draggedFlowId]);

  const handleColumnDragEnd = useCallback(() => {
    setDraggedFlowId(null);
    setDropTargetId(null);
    setDropSide(null);
  }, []);

  const handleColumnDrop = useCallback(async (targetId: string) => {
    if (!draggedFlowId || targetId === draggedFlowId || !dropSide) {
      handleColumnDragEnd();
      return;
    }
    const targetIdx = flows.findIndex(f => f.id === targetId);
    if (targetIdx < 0) { handleColumnDragEnd(); return; }

    let newPos: number;
    if (dropSide === 'left') {
      const prev = targetIdx > 0 ? (flows[targetIdx - 1].position ?? targetIdx - 1) : (flows[targetIdx].position ?? targetIdx) - 1;
      newPos = (prev + (flows[targetIdx].position ?? targetIdx)) / 2;
    } else {
      const next = targetIdx < flows.length - 1 ? (flows[targetIdx + 1].position ?? targetIdx + 1) : (flows[targetIdx].position ?? targetIdx) + 1;
      newPos = ((flows[targetIdx].position ?? targetIdx) + next) / 2;
    }

    try {
      await onSave(draggedFlowId, { position: newPos });
    } catch (err: any) {
      console.error('Failed to reorder flow:', err);
    }
    handleColumnDragEnd();
  }, [draggedFlowId, dropSide, flows, onSave, handleColumnDragEnd]);

  const boardRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (flows.length > 0 && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      requestAnimationFrame(() => {
        if (boardRef.current) boardRef.current.scrollLeft = 0;
      });
    }
  }, [flows.length]);

  return (
    <div className={s.board} ref={boardRef}>
      {flows.map(flow => (
        <FlowColumn
          key={flow.id}
          flow={flow}
          onSave={onSave}
          onSaveSteps={onSaveSteps}
          onDeleteFlow={onDeleteFlow}
          allFlows={flows}
          taskTypes={taskTypes?.length ? taskTypes : BUILT_IN_TYPES}
          onColumnDragStart={handleColumnDragStart}
          onColumnDragOver={handleColumnDragOver}
          onColumnDragEnd={handleColumnDragEnd}
          onColumnDrop={handleColumnDrop}
          showDropLeft={dropTargetId === flow.id && dropSide === 'left' && draggedFlowId !== flow.id}
          showDropRight={dropTargetId === flow.id && dropSide === 'right' && draggedFlowId !== flow.id}
        />
      ))}

      {/* Add flow button */}
      <button className={s.addColumn} onClick={handleNewFlow} disabled={creating}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {creating ? 'Creating...' : 'Add flow'}
      </button>
    </div>
  );
}
