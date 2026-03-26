'use client';

import { useRivalRadarStore } from '@/store/rivalradar';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { ScoreChip } from '@/components/ScoreChip';
import { StarRating } from '@/components/StarRating';

const CompetitorsList = () => {
  const { project } = useRivalRadarStore();
  const router = useRouter();

  if (!project) return null;

  const allBiz = [project.ownBusiness, ...project.competitors];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        All Businesses
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allBiz.map((biz) => (
          <div
            key={biz.id}
            onClick={() => router.push(`/competitors/${biz.id}`)}
            className="card-surface cursor-pointer hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{biz.name}</h3>
                  {biz.id === project.ownBusiness.id && (
                    <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">YOU</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{biz.domain}</p>
              </div>
              <span className="text-2xl font-bold text-foreground">{biz.aiScore?.overallScore ?? '—'}</span>
            </div>
            {biz.googleData && (
              <div className="mb-3">
                <StarRating rating={biz.googleData.googleRating} />
                <span className="text-xs text-muted-foreground ml-2">({biz.googleData.reviewCount})</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {biz.aiScore && (
                <>
                  <ScoreChip label="Reputation" score={biz.aiScore.reputationScore} />
                  <ScoreChip label="Local Visibility" score={biz.aiScore.localVisibilityScore} />
                  <ScoreChip label="Website Health" score={biz.aiScore.websiteHealthScore} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CompetitorsList;
