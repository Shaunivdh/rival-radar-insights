import type { SerpData } from '@/types';

export async function getRankingData(_businessName: string, _service: string, _location: string): Promise<SerpData> {
  // TODO: SerpApi search
  console.log('getRankingData stub called');
  throw new Error('Not implemented — use mock data');
}
