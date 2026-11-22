import React, { useEffect, useState } from 'react';
import { Building2, FolderKanban, Loader2 } from 'lucide-react';
import { getTenantContext, selectTenantContext, setTenantContext } from '@/lib/tenantContext';

export default function TenantContextBar() {
  const [context, setContext] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(() => getTenantContext().projectId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadContext() {
      try {
        const response = await fetch('/api/context', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error('context_unavailable');
        const value = await response.json();
        if (!active) return;
        setContext(value);
        const current = getTenantContext();
        const organizationId = current.organizationId || value.organization?.id || '';
        const projectId = current.projectId || value.project?.id || '';
        setTenantContext({ organizationId, projectId });
        setSelectedProjectId(projectId);
      } catch {
        if (active) setError('Contexto de organização/projeto indisponível');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadContext();
    return () => { active = false; };
  }, []);

  async function handleProjectChange(event) {
    const projectId = event.target.value;
    const project = (context?.projects || []).find((item) => String(item.id) === String(projectId));
    if (!project) return;
    setSaving(true);
    setError('');
    try {
      const value = await selectTenantContext({
        organizationId: context.organization?.id,
        projectId: project.id,
      });
      setContext(value);
      setSelectedProjectId(String(project.id));
      window.location.reload();
    } catch {
      setError('Não foi possível trocar o projeto');
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando contexto…</div>;
  }
  if (!context || error && !context) return null;

  const projects = Array.isArray(context.projects) ? context.projects : [];
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
        <Building2 className="h-3.5 w-3.5 text-slate-500" />
        {context.organization?.name || 'Organização'}
      </span>
      <label className="inline-flex items-center gap-1.5 text-slate-600">
        <FolderKanban className="h-3.5 w-3.5 text-slate-500" />
        <span className="sr-only">Projeto ativo</span>
        <select
          value={selectedProjectId || context.project?.id || ''}
          onChange={handleProjectChange}
          disabled={saving || projects.length <= 1}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:cursor-default disabled:bg-slate-50"
        >
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
      </label>
      {error && <span className="text-rose-600">{error}</span>}
    </div>
  );
}
