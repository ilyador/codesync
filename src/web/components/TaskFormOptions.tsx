import type { Flow, ProviderConfig } from '../lib/api';
import type { FlowExecutionCapabilities } from '../../shared/flow-execution-capabilities';
import {
  type CustomTypeOption,
  type MemberOption,
  type WorkstreamOption,
} from './task-form-shared';
import { TaskTypeAssignmentSection } from './TaskTypeAssignmentSection';
import { TaskPlacementSection } from './TaskPlacementSection';
import { TaskExecutionSection } from './TaskExecutionSection';

interface TaskFormOptionsProps {
  workstreams: WorkstreamOption[];
  members: MemberOption[];
  flows: Flow[];
  customTypes: CustomTypeOption[];
  type: string;
  customType: string;
  customPipeline: string;
  isCustomType: boolean;
  assignee: string;
  flowId: string;
  providerConfigId: string;
  providerModel: string;
  selectedFlow: Flow | null;
  selectedProvider: ProviderConfig | null;
  taskSelectableProviders: ProviderConfig[];
  flowCapabilities: FlowExecutionCapabilities | null;
  providerSelectionEnabled: boolean;
  modelSelectionEnabled: boolean;
  reasoningSelectionEnabled: boolean;
  subagentSelectionEnabled: boolean;
  executionSettingsLocked: boolean;
  effort: string;
  workstreamId: string;
  priority: string;
  multiagent: string;
  autoContinue: boolean;
  chaining: string;
  setType: (value: string) => void;
  setCustomType: (value: string) => void;
  setCustomPipeline: (value: string) => void;
  setIsCustomType: (value: boolean) => void;
  setAssignee: (value: string) => void;
  setFlowId: (value: string) => void;
  setProviderConfigId: (value: string) => void;
  setProviderModel: (value: string) => void;
  setMode: (value: string) => void;
  setEffort: (value: string) => void;
  setWorkstreamId: (value: string) => void;
  setPriority: (value: string) => void;
  setMultiagent: (value: string) => void;
  setAutoContinue: (value: boolean) => void;
  setChaining: (value: string) => void;
}

export function TaskFormOptions({
  workstreams,
  members,
  flows,
  customTypes,
  type,
  customType,
  customPipeline,
  isCustomType,
  assignee,
  flowId,
  providerConfigId,
  providerModel,
  selectedFlow,
  selectedProvider,
  taskSelectableProviders,
  flowCapabilities,
  providerSelectionEnabled,
  modelSelectionEnabled,
  reasoningSelectionEnabled,
  subagentSelectionEnabled,
  executionSettingsLocked,
  effort,
  workstreamId,
  priority,
  multiagent,
  autoContinue,
  chaining,
  setType,
  setCustomType,
  setCustomPipeline,
  setIsCustomType,
  setAssignee,
  setFlowId,
  setProviderConfigId,
  setProviderModel,
  setMode,
  setEffort,
  setWorkstreamId,
  setPriority,
  setMultiagent,
  setAutoContinue,
  setChaining,
}: TaskFormOptionsProps) {
  return (
    <>
      <TaskTypeAssignmentSection
        flows={flows}
        members={members}
        customTypes={customTypes}
        type={type}
        customType={customType}
        customPipeline={customPipeline}
        isCustomType={isCustomType}
        assignee={assignee}
        flowId={flowId}
        providerConfigId={providerConfigId}
        providerModel={providerModel}
        selectedFlow={selectedFlow}
        selectedProvider={selectedProvider}
        taskSelectableProviders={taskSelectableProviders}
        flowCapabilities={flowCapabilities}
        providerSelectionEnabled={providerSelectionEnabled}
        modelSelectionEnabled={modelSelectionEnabled}
        reasoningSelectionEnabled={reasoningSelectionEnabled}
        executionSettingsLocked={executionSettingsLocked}
        effort={effort}
        setType={setType}
        setCustomType={setCustomType}
        setCustomPipeline={setCustomPipeline}
        setIsCustomType={setIsCustomType}
        setAssignee={setAssignee}
        setFlowId={setFlowId}
        setProviderConfigId={setProviderConfigId}
        setProviderModel={setProviderModel}
        setMode={setMode}
        setEffort={setEffort}
        setAutoContinue={setAutoContinue}
      />

      <TaskPlacementSection
        workstreams={workstreams}
        workstreamId={workstreamId}
        priority={priority}
        setWorkstreamId={setWorkstreamId}
        setPriority={setPriority}
      />

      <TaskExecutionSection
        assignee={assignee}
        flowCapabilities={flowCapabilities}
        providerSelectionEnabled={providerSelectionEnabled}
        subagentSelectionEnabled={subagentSelectionEnabled}
        executionSettingsLocked={executionSettingsLocked}
        multiagent={multiagent}
        autoContinue={autoContinue}
        chaining={chaining}
        setMultiagent={setMultiagent}
        setAutoContinue={setAutoContinue}
        setChaining={setChaining}
      />
    </>
  );
}
