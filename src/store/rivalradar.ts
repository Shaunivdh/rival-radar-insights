import { create } from 'zustand';
import type { Project, Business, AppSettings, PriorityAction, User } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { getProject, fetchPriorityActions } from '@/actions/projects';

interface SyncedBusiness {
  id: string;
  crawlStatus: Business['crawlStatus'];
  signals: Business['signals'];
  aiScore: Business['aiScore'];
  enrichmentErrors?: Business['enrichmentErrors'];
  changeEvents?: Business['changeEvents'];
  googleData?: Business['googleData'];
  serpData?: Business['serpData'];
}

interface RivalRadarState {
  user: User | null;
  project: Project | null;
  settings: AppSettings;
  priorityActions: PriorityAction[];
  isDemoMode: boolean;
  demoBannerDismissed: boolean;
  signup: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<{ ok: boolean; needsConfirmation?: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setProject: (project: Project) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setPriorityActions: (actions: PriorityAction[]) => void;
  dismissDemoBanner: () => void;
  deleteProject: () => void;
  syncBusinesses: (updates: SyncedBusiness[]) => void;
  getBusinessById: (id: string) => Business | undefined;
  addCompetitorToStore: (business: Business) => void;
}

export const useRivalRadarStore = create<RivalRadarState>()((set, get) => ({
  user: null,
  project: null,
  settings: { primaryService: 'accounting', location: '' },
  priorityActions: [],
  isDemoMode: false,
  demoBannerDismissed: false,

  signup: async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: name ? { data: { full_name: name } } : undefined,
    });
    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: 'Signup failed.' };
    // If email confirmation is enabled, data.session is null — don't set user yet
    if (!data.session) return { ok: true, needsConfirmation: true };
    const username = data.user.user_metadata?.full_name || undefined;
    set({
      user: { id: data.user.id, email: data.user.email!, username },
      project: null,
      priorityActions: [],
      isDemoMode: false,
      demoBannerDismissed: false,
    });
    return { ok: true };
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: 'Login failed.' };
    const username = data.user.user_metadata?.full_name || undefined;
    set({
      user: { id: data.user.id, email: data.user.email!, username },
      project: null,
      priorityActions: [],
      isDemoMode: false,
      demoBannerDismissed: false,
    });
    return { ok: true };
  },

  logout: async () => {
    await supabase.auth.signOut();
    document.cookie = 'rr-demo=; path=/; max-age=0';
    set({
      user: null,
      project: null,
      priorityActions: [],
      isDemoMode: false,
      demoBannerDismissed: false,
    });
  },

  initAuth: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      const u = data.session.user;
      const username = u.user_metadata?.full_name || undefined;
      set((state) => ({
        user: state.user?.id === u.id ? state.user : { id: u.id, email: u.email!, username },
      }));
      const project = await getProject();
      if (project) {
        set({ project, isDemoMode: false });
        fetchPriorityActions(project.id)
          .then((actions) => {
            if (actions.length) set({ priorityActions: actions });
          })
          .catch(() => {});
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
      supabase
        .from('app_settings')
        .upsert(
          {
            user_id: user.id,
            primary_service: settings.primaryService,
            location: settings.location,
            // column is `text not null default ''` — writing null fails the upsert
            postcode: settings.postcode ?? '',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .then(({ error }) => {
          if (error) console.error('[setSettings] upsert failed:', error.message, error.details);
          else
            console.log(
              '[setSettings] saved: primaryService=',
              settings.primaryService,
              'location=',
              settings.location,
            );
        });
    }
  },
  setPriorityActions: (actions) => set({ priorityActions: actions }),
  dismissDemoBanner: () => set({ demoBannerDismissed: true }),

  deleteProject: () => {
    document.cookie = 'rr-demo=; path=/; max-age=0';
    set({ project: null, priorityActions: [], demoBannerDismissed: false, isDemoMode: false });
  },

  loadMockData: () => {
    // Mock data removed — demo mode disabled
  },

  syncBusinesses: (updates) => {
    const { project } = get();
    if (!project) return;
    const apply = (b: Business): Business => {
      const u = updates.find((x) => x.id === b.id);
      if (!u) return b;
      return {
        ...b,
        crawlStatus: u.crawlStatus,
        signals: u.signals ?? b.signals,
        aiScore: u.aiScore ?? b.aiScore,
        enrichmentErrors:
          u.enrichmentErrors !== undefined ? u.enrichmentErrors : b.enrichmentErrors,
        changeEvents: u.changeEvents !== undefined ? u.changeEvents : b.changeEvents,
        googleData: u.googleData !== undefined ? u.googleData : b.googleData,
        serpData: u.serpData !== undefined ? u.serpData : b.serpData,
      };
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
      return {
        project: { ...state.project, competitors: [...state.project.competitors, business] },
      };
    });
  },
}));
