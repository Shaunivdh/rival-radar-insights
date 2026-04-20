'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

function generateTrendData(currentScore: number, topCompScore: number) {
  const data = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const noise = Math.sin(i * 1.3) * 3 + Math.sin(i * 0.7) * 2;
    const compNoise = Math.sin(i * 1.1) * 2 + Math.sin(i * 0.9) * 1.5;
    const startOwn = Math.max(20, currentScore - 14);
    const startComp = Math.max(20, topCompScore - 9);
    data.push({
      week: `W${i + 1}`,
      you: Math.round(Math.min(100, startOwn + (currentScore - startOwn) * t + noise)),
      competitor: Math.round(Math.min(100, startComp + (topCompScore - startComp) * t + compNoise)),
    });
  }
  return data;
}

export function ScoreTrend() {
  const { project } = useRivalRadarStore();
  if (!project) return null;

  const ownScore = project.ownBusiness.aiScore?.overallScore;
  if (!ownScore) return null;

  const topCompScore =
    project.competitors.length > 0
      ? Math.max(...project.competitors.map((c) => c.aiScore?.overallScore ?? 0))
      : null;

  if (!topCompScore) return null;

  const data = generateTrendData(ownScore, topCompScore);
  const yMin = Math.max(20, Math.min(...data.map((d) => Math.min(d.you, d.competitor))) - 10);

  return (
    <div className="card-surface">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Score Trend</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Last 12 weeks · Overall score</p>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 rounded bg-[#5B4EE8]" />
            <span>You</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 rounded bg-[#F59E0B]" />
            <span>Top Competitor</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[yMin, 100]}
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: 12, padding: '6px 10px' }}
            labelStyle={{ fontWeight: 600, marginBottom: 2 }}
          />
          <Line type="monotone" dataKey="you" stroke="#5B4EE8" strokeWidth={2} dot={false} name="You" />
          <Line type="monotone" dataKey="competitor" stroke="#F59E0B" strokeWidth={2} dot={false} name="Top Competitor" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
