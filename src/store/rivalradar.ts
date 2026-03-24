import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, Business, AppSettings, PriorityAction, User } from '@/types';
import { mockOwnBusiness, mockCompetitors, mockPriorityActions } from '@/mock/data';
import { supabase } from '@/lib/supabase/client';
import { getProject } from '@/actions/projects';

interface SyncedBusiness {
  id: string;
  crawlStatus: Business['crawlStatus'];
  signals: Business['signals'];
  aiScore: Business['aiScore'];
  enrichmentErrors?: Business['enrichmentErrors'];
}

interface RivalRadarState {
  user: User | null;
  project: Project | null;
  settings: AppSettings;
  priorityActions: PriorityAction[];
  isDemoMode: boolean;
  demoBannerDismissed: boolean;
  signup: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setProject: (project: Project) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setPriorityActions: (actions: PriorityAction[]) => void;
  dismissDemoBanner: () => void;
  deleteProject: () => void;
  loadMockData: () => void;
  syncBusinesses: (updates: SyncedBusiness[]) => void;
  getBusinessById: (id: string) => Business | undefined;
  addCompetitorToStore: (business: Business) => void;
}

export const useRivalRadarStore = create<RivalRadarState>()(
  persist(
    (set, get) => ({
      user: null,
      project: null,
      settings: { primaryService: '', location: '' },
      priorityActions: [],
      isDemoMode: false,
      demoBannerDismissed: false,

      signup: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { ok: false, error: error.message };
        if (!data.user) return { ok: false, error: 'Signup failed.' };
        set({ user: { id: data.user.id, email: data.user.email! }, project: null, priorityActions: [], isDemoMode: false, demoBannerDismissed: false });
        return { ok: true };
      },

      login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: error.message };
        if (!data.user) return { ok: false, error: 'Login failed.' };
        set({ user: { id: data.user.id, email: data.user.email! }, project: null, priorityActions: [], isDemoMode: false, demoBannerDismissed: false });
        return { ok: true };
      },

      logout: async () => {
        await supabase.auth.signOut();
        document.cookie = 'rr-demo=; path=/; max-age=0';
        set({ user: null, project: null, priorityActions: [], isDemoMode: false, demoBannerDismissed: false });
      },

      initAuth: async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const u = data.session.user;
          set((state) => ({
            user: state.user?.id === u.id ? state.user : { id: u.id, email: u.email! },
          }));
          try {
            const project = await getProject(u.id);
            if (project) set({ project, isDemoMode: false });
          } catch {
            // Supabase unavailable — keep persisted localStorage state as demo fallback
          }
        } else {
          set({ user: null, isDemoMode: false });
        }
      },

      setUser: (user) => set({ user }),
      setProject: (project) => set({ project, isDemoMode: false }),
      setSettings: (newSettings) => {
        set((state) => ({ settings: { ...state.settings, ...newSettings } }));
        const { user, settings } = get();
        if (user?.id) {
          supabase.from('app_settings').upsert({
            user_id: user.id,
            primary_service: settings.primaryService,
            location: settings.location,
            postcode: settings.postcode ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' }).then(() => {});
        }
      },
      setPriorityActions: (actions) => set({ priorityActions: actions }),
      dismissDemoBanner: () => set({ demoBannerDismissed: true }),

      deleteProject: () => {
        document.cookie = 'rr-demo=; path=/; max-age=0';
        set({ project: null, priorityActions: [], demoBannerDismissed: false, isDemoMode: false });
      },

      loadMockData: () => {
        document.cookie = 'rr-demo=1; path=/; max-age=86400';
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
          settings: { primaryService: 'building contractor', location: 'Manchester' },
        });
      },

      syncBusinesses: (updates) => {
        const { project } = get();
        if (!project) return;
        const apply = (b: Business): Business => {
          const u = updates.find((x) => x.id === b.id);
          if (!u) return b;
          return { ...b, crawlStatus: u.crawlStatus, signals: u.signals ?? b.signals, aiScore: u.aiScore ?? b.aiScore, enrichmentErrors: u.enrichmentErrors !== undefined ? u.enrichmentErrors : b.enrichmentErrors };
        };
        set({
          project: {
            ...project,
            ownBusiness: apply(project.ownBusiness),
            competitors: project.competitors.map(apply),
          },
        });
      },

      getBusinessById: (id) => {
        const state = get();
        if (!state.project) return undefined;
        if (state.project.ownBusiness.id === id) return state.project.ownBusiness;
        return state.project.competitors.find((c) => c.id === id);
      },

      addCompetitorToStore: (business) => {
        set((state) => {
          if (!state.project) return state;
          return { project: { ...state.project, competitors: [...state.project.competitors, business] } };
        });
      },
    }),
    { name: 'rivalradar-store' }
  )
);
