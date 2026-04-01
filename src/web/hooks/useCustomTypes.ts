import { useState, useEffect, useCallback } from 'react';
import { getCustomTypes, createCustomType, deleteCustomType, type CustomTaskType } from '../lib/api';

export function useCustomTypes(projectId: string | null) {
  const [types, setTypes] = useState<CustomTaskType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const data = await getCustomTypes(projectId);
      setTypes(data);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const addType = useCallback(async (name: string, pipeline?: string, description?: string) => {
    if (!projectId) return;
    const created = await createCustomType(projectId, name, pipeline, description);
    setTypes(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }, [projectId]);

  const removeType = useCallback(async (id: string) => {
    await deleteCustomType(id);
    setTypes(prev => prev.filter(t => t.id !== id));
  }, []);

  return { types, loading, reload: load, addType, removeType };
}
