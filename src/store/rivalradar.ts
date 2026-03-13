import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, Business, AppSettings, PriorityAction } from '@/types';
import { mockOwnBusiness, mockCompetitors, mockPriorityActions } from '@/mock/data';

interface RivalRadarState {
  project: Project | null;
  settings: AppSettings;
  priorityActions: PriorityAction[];
  isDemoMode: boolean;
  demoBannerDismissed: boolean;
  setProject: (project: Project) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setPriorityActions: (actions: PriorityAction[]) => void;
  dismissDemoBanner: () => void;
  deleteProject: () => void;
  loadMockData: () => void;
  getBusinessById: (id: string) => Business | undefined;
}

export const useRivalRadarStore = create<RivalRadarState>()(
  persist(
    (set, get) => ({
      project: null,
      settings: {
        cfAccountId: '',
        cfApiToken: '',
        googlePlacesApiKey: '',
        serpApiKey: '',
        anthropicApiKey: '',
        primaryService: '',
        location: '',
      },
      priorityActions: [],
      isDemoMode: true,
      demoBannerDismissed: false,

      setProject: (project) => set({ project }),

      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
          isDemoMode: !newSettings.cfApiToken && !state.settings.cfApiToken,
        })),

      setPriorityActions: (actions) => set({ priorityActions: actions }),

      dismissDemoBanner: () => set({ demoBannerDismissed: true }),

      deleteProject: () => set({ project: null, priorityActions: [], demoBannerDismissed: false }),

      loadMockData: () => {
        set({
          project: {
            id: 'demo-project',
            name: 'Apex Builders vs Competitors',
            createdAt: Date.now(),
            ownBusiness: mockOwnBusiness,
            competitors: mockCompetitors,
          },
          priorityActions: mockPriorityActions,
          isDemoMode: true,
          settings: {
            cfAccountId: '',
            cfApiToken: '',
            googlePlacesApiKey: '',
            serpApiKey: '',
            anthropicApiKey: '',
            primaryService: 'building contractor',
            location: 'Manchester',
          },
        });
      },

      getBusinessById: (id) => {
        const state = get();
        if (!state.project) return undefined;
        if (state.project.ownBusiness.id === id) return state.project.ownBusiness;
        return state.project.competitors.find((c) => c.id === id);
      },
    }),
    { name: 'rivalradar-store' }
  )
);
