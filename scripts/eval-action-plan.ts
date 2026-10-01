/**
 * Action plan eval: for every project in Supabase, compares the plan stored by
 * the pipeline that produced it with the plan the current code would generate,
 * and checks every user-readable string against the CLAUDE.md copy rules.
 *
 * Read-only against the database. Dry runs make no AI calls: when the AI
 * insight would run, the report says so instead. --live makes the real call
 * (and counts every AI call, including the fact-checker)
 * (about $0.02 per project that needs one) and records its token usage.
 *
 * Usage:
 *   bunx tsx --conditions=react-server scripts/eval-action-plan.ts
 *   bunx tsx --conditions=react-server scripts/eval-action-plan.ts --live --label after-prompt-7
 *   bunx tsx --conditions=react-server scripts/eval-action-plan.ts --compare before
 *
 * Writes scripts/eval-output/action-plan-<label>.{json,md} (gitignored: it
 * contains real business names).
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import type { PriorityAction } from '../src/types';

type Usage = { in: number; out: number };
type PlanAction = {
  source: 'template' | 'llm' | 'stored';
  templateId: string | null;
  action: string;
  competitorReference: string | null;
  issues: string[];
};
type ProjectReport = {
  project: string;
  location: string | null;
  primaryService: string | null;
  stored: PlanAction[];
  generated: PlanAction[];
  firedTemplates: string[];
  aiInsight: 'skipped: enough templates' | 'would run (dry run)' | 'ran' | 'ran: dropped or empty';
  usage: Usage[];
};
type Snapshot = { label: string; createdAt: string; live: boolean; projects: ProjectReport[] };

const args = process.argv.slice(2);
const live = args.includes('--live');
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const label = argValue('--label') ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const compareTo = argValue('--compare');
const OUT_DIR = path.resolve(__dirname, 'eval-output');

async function main() {
  // Server modules read env at import time, so load them after dotenv.
  const { supabaseAdmin } = await import('../src/lib/supabase/server');
  const { loadProjectForActions } = await import('../src/lib/priorityActionsGenerator');
  const { applyTemplates } = await import('../src/lib/priorityTemplates');
  const { generatePriorityActions, AI_FILL_THRESHOLD } = await import('../src/services/ai');
  const { lintCopy } = await import('../src/lib/copyLint');
  const { asProjectId } = await import('../src/types');

  const issuesOf = (a: Partial<PriorityAction>) =>
    lintCopy(
      [a.action, a.reason, a.whyItMatters, ...(a.steps ?? []), a.outcome, a.competitorReference]
        .filter(Boolean)
        .join(' '),
    ).map((i) => `${i.kind}: "${i.match}"`);

  const { data: projects } = await supabaseAdmin.from('projects').select('id, name');
  const reports: ProjectReport[] = [];

  for (const p of projects ?? []) {
    const loaded = await loadProjectForActions(asProjectId(p.id));
    if ('missing' in loaded) {
      console.log(`skip ${p.name}: ${loaded.missing}`);
      continue;
    }
    const { own, competitors, primaryService, location } = loaded;

    const { data: rows } = await supabaseAdmin
      .from('priority_actions')
      .select(
        'action, reason, why_it_matters, steps, outcome, competitor_reference, template_id, status',
      )
      .eq('project_id', p.id)
      .in('status', ['active', 'snoozed', 'queued']);
    const stored: PlanAction[] = (rows ?? []).map((r) => ({
      source: 'stored',
      templateId: r.template_id,
      action: r.action,
      competitorReference: r.competitor_reference,
      issues: issuesOf({
        action: r.action,
        reason: r.reason,
        whyItMatters: r.why_it_matters ?? '',
        steps: (r.steps as string[] | null) ?? [],
        outcome: r.outcome ?? '',
        competitorReference: r.competitor_reference,
      }),
    }));

    // A fresh plan from scratch (nothing excluded), so runs are comparable.
    const { actions: templateActions, firedIds } = applyTemplates(own, competitors, {
      location,
      serviceCategory: primaryService,
    });
    const toPlan = (a: PriorityAction, source: PlanAction['source']): PlanAction => ({
      source,
      templateId: a.templateId ?? null,
      action: a.action,
      competitorReference: a.competitorReference,
      issues: issuesOf(a),
    });

    const usage: Usage[] = [];
    let generated = templateActions.map((a) => toPlan(a, 'template'));
    let aiInsight: ProjectReport['aiInsight'] =
      templateActions.length >= AI_FILL_THRESHOLD
        ? 'skipped: enough templates'
        : 'would run (dry run)';

    // Live runs always go through the real pipeline, so fact-checker tokens are
    // counted even when templates fill the plan and the insight is skipped.
    if (live) {
      const restore = captureUsage(usage);
      try {
        const out = await generatePriorityActions(own, competitors, primaryService, { location });
        generated = out.map((a) => toPlan(a, a.templateId ? 'template' : 'llm'));
        if (aiInsight === 'would run (dry run)')
          aiInsight = out.some((a) => !a.templateId) ? 'ran' : 'ran: dropped or empty';
      } finally {
        restore();
      }
    }

    reports.push({
      project: own.name,
      location: location ?? null,
      primaryService: primaryService ?? null,
      stored,
      generated,
      firedTemplates: firedIds,
      aiInsight,
      usage,
    });
  }

  const snapshot: Snapshot = {
    label,
    createdAt: new Date().toISOString(),
    live,
    projects: reports,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, `action-plan-${label}`);
  writeFileSync(`${base}.json`, JSON.stringify(snapshot, null, 2));
  const previous = compareTo ? loadSnapshot(compareTo) : null;
  writeFileSync(`${base}.md`, renderMarkdown(snapshot, previous));
  console.log(`Wrote ${base}.md`);
}

/** Collect usageIn/usageOut from the '[ai-event] usage' log lines while a call runs. */
function captureUsage(into: Usage[]): () => void {
  const original = console.log;
  console.log = (...parts: unknown[]) => {
    const line = parts.map(String).join(' ');
    const m = line.match(/\[ai-event\] usage .*"usageIn":(\d+).*"usageOut":(\d+)/);
    if (m) into.push({ in: Number(m[1]), out: Number(m[2]) });
    original(...parts);
  };
  return () => {
    console.log = original;
  };
}

function loadSnapshot(name: string): Snapshot | null {
  const p = path.join(OUT_DIR, `action-plan-${name}.json`);
  if (!existsSync(p)) {
    console.warn(`No snapshot ${p}; skipping comparison`);
    return null;
  }
  return JSON.parse(readFileSync(p, 'utf8')) as Snapshot;
}

const total = (u: Usage[]) =>
  u.reduce((s, x) => ({ in: s.in + x.in, out: s.out + x.out }), { in: 0, out: 0 });

function renderMarkdown(s: Snapshot, prev: Snapshot | null): string {
  const lines: string[] = [
    `# Action plan eval: ${s.label}`,
    '',
    `${s.createdAt} · ${s.live ? 'live (AI calls made)' : 'dry run (no AI calls)'}${prev ? ` · compared with \`${prev.label}\`` : ''}`,
    '',
    '| Project | Stored actions | Generated | From templates | AI insight | Tokens in / out | Copy issues |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const p of s.projects) {
    const t = total(p.usage);
    const issues = [...p.stored, ...p.generated].reduce((n, a) => n + a.issues.length, 0);
    lines.push(
      `| ${p.project} | ${p.stored.length} | ${p.generated.length} | ${p.generated.filter((a) => a.source === 'template').length} | ${p.aiInsight} | ${t.in} / ${t.out} | ${issues} |`,
    );
  }

  for (const p of s.projects) {
    lines.push(
      '',
      `## ${p.project} (${p.primaryService ?? 'no category'}, ${p.location ?? 'no location'})`,
      '',
    );
    lines.push(`Fired templates (rank order): ${p.firedTemplates.join(', ') || 'none'}`, '');
    const list = (title: string, actions: PlanAction[]) => {
      lines.push(`### ${title}`, '');
      if (!actions.length) lines.push('_none_');
      for (const a of actions) {
        lines.push(`- **${a.action}** (${a.source}${a.templateId ? `: ${a.templateId}` : ''})`);
        if (a.competitorReference) lines.push(`  - vs: ${a.competitorReference}`);
        for (const i of a.issues) lines.push(`  - ⚠ ${i}`);
      }
      lines.push('');
    };
    list('Stored plan (pipeline that produced it)', p.stored);
    list('Generated now', p.generated);

    const before = prev?.projects.find((x) => x.project === p.project);
    if (before) {
      const was = new Set(before.generated.map((a) => a.action));
      const now = new Set(p.generated.map((a) => a.action));
      lines.push(`### Change since \`${prev!.label}\``, '');
      for (const a of now) if (!was.has(a)) lines.push(`- added: ${a}`);
      for (const a of was) if (!now.has(a)) lines.push(`- removed: ${a}`);
      const tb = total(before.usage);
      const tn = total(p.usage);
      lines.push(`- tokens in / out: ${tb.in} / ${tb.out} to ${tn.in} / ${tn.out}`, '');
    }
  }
  return lines.join('\n') + '\n';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
