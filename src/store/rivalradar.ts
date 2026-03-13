import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, Business, AppSettings, PriorityAction, User } from '@/types';
import { mockOwnBusiness, mockCompetitors, mockPriorityActions } from '@/mock/data';

interface RivalRadarState {
  user: User | null;
  registeredUsers: User[];
  project: Project | null;
  settings: AppSettings;
  priorityActions: PriorityAction[];
  isDemoMode: boolean;
  demoBannerDismissed: boolean;
  signup: (name: string, password: string) => boolean;
  login: (name: string, password: string) => boolean;
  logout: () => void;
  setUser: (user: User) => void;
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
      user: null,
      registeredUsers: [],
      project: null,
      settings: {
        primaryService: '',
        location: '',
      },
      priorityActions: [],
      isDemoMode: false,
      demoBannerDismissed: false,

      signup: (name, password) => {
        const { registeredUsers } = get();
        if (registeredUsers.find((u) => u.name.toLowerCase() === name.toLowerCase())) return false;
        const newUser: User = { name, password };
        set({ registeredUsers: [...registeredUsers, newUser], user: newUser });
        return true;
      },

      login: (name, password) => {
        const { registeredUsers } = get();
        const found = registeredUsers.find(
          (u) => u.name.toLowerCase() === name.toLowerCase() && u.password === password
        );
        if (!found) return false;
        set({ user: found });
        return true;
      },

      logout: () =>
        set({ user: null, project: null, priorityActions: [], isDemoMode: false, demoBannerDismissed: false }),

      setUser: (user) => set({ user }),

      setProject: (project) => set({ project, isDemoMode: false }),

      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      setPriorityActions: (actions) => set({ priorityActions: actions }),

      dismissDemoBanner: () => set({ demoBannerDismissed: true }),

      deleteProject: () => set({ project: null, priorityActions: [], demoBannerDismissed: false, isDemoMode: false }),

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
          demoBannerDismissed: false,
          settings: {
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
