import type { ExtractedSignals, AIHealthScore, PriorityAction, ChangeSummary, Business } from '@/types';

export async function generateHealthScore(_signals: ExtractedSignals): Promise<AIHealthScore> {
  // TODO: Claude API call
  console.log('generateHealthScore stub called');
  throw new Error('Not implemented — use mock data');
}

export async function generatePriorityActions(_own: Business, _competitors: Business[]): Promise<PriorityAction[]> {
  // TODO: Claude API call
  console.log('generatePriorityActions stub called');
  throw new Error('Not implemented — use mock data');
}

export async function generateChangeSummary(_name: string, _before: ExtractedSignals, _after: ExtractedSignals): Promise<ChangeSummary> {
  // TODO: Claude API call
  console.log('generateChangeSummary stub called');
  throw new Error('Not implemented — use mock data');
}
