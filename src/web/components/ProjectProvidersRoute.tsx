import { ProviderSettingsPage } from './ProviderSettingsPage';
import type { ProjectWorkspaceRoutesProps } from './ProjectWorkspaceRoutes';

type ProjectProvidersRouteProps = Pick<
  ProjectWorkspaceRoutesProps,
  | 'providers'
  | 'embeddingProviderConfigId'
  | 'embeddingDimensions'
  | 'detectedLocalProviders'
  | 'onCreateProvider'
  | 'onUpdateProvider'
  | 'onDeleteProvider'
  | 'onTestProvider'
  | 'onRefreshProviderModels'
  | 'onUpdateEmbeddingProvider'
  | 'onReindexDocuments'
>;

export function ProjectProvidersRoute(props: ProjectProvidersRouteProps) {
  return <ProviderSettingsPage {...props} />;
}
