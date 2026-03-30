'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { Settings as SettingsIcon, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rescanAll } from '@/actions/projects';

const SettingsPage = () => {
  const { settings, setSettings, deleteProject, project } = useRivalRadarStore();

  const allBusinesses = project
    ? [project.ownBusiness, ...project.competitors]
    : [];
  const enrichmentErrorBusinesses = allBusinesses.filter((b) => b.enrichmentErrors && (b.enrichmentErrors.google || b.enrichmentErrors.serp));
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [rescanning, setRescanning] = useState(false);

  const handleSave = () => {
    setSettings(form);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete the project? This cannot be undone.')) {
      deleteProject();
      router.push('/');
    }
  };

  const fields = [
    { key: 'primaryService', label: 'Primary Service', type: 'text' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'postcode', label: 'Postcode', type: 'text' },
  ] as const;

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-primary" />
        Settings
      </h1>

      <div className="card-surface space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Project Settings</h2>
        {fields.map((field) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{field.label}</label>
            <input
              type={field.type}
              value={form[field.key] ?? ''}
              onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder=""
            />
          </div>
        ))}
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          Save Settings
        </button>
      </div>

      {enrichmentErrorBusinesses.length > 0 && (
        <div className="card-surface space-y-3 border border-amber-500/30">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Enrichment Warnings
          </h2>
          <div className="space-y-2">
            {enrichmentErrorBusinesses.map((b) => (
              <div key={b.id} className="text-xs space-y-0.5">
                <p className="font-medium text-foreground">{b.name}</p>
                {b.enrichmentErrors?.google && (
                  <p className="text-amber-600">Google data unavailable — {b.enrichmentErrors.google}</p>
                )}
                {b.enrichmentErrors?.serp && (
                  <p className="text-amber-600">Search ranking unavailable — {b.enrichmentErrors.serp}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-surface space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Actions</h2>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              if (!project) return;
              setRescanning(true);
              await rescanAll(project.id);
              setRescanning(false);
              router.push('/dashboard');
            }}
            disabled={rescanning || !project}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${rescanning ? 'animate-spin' : ''}`} />
            {rescanning ? 'Starting…' : 'Re-scan All'}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20"
          >
            <Trash2 className="w-4 h-4" /> Delete Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
