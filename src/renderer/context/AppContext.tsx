import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type {
  AppSettings,
  ApprovalRequest,
  Bootstrap,
  CodexAuthStatus,
  DotSummary,
  LoginProgress,
  ProviderOption,
  ProviderProfile,
  PushEvent,
  Run,
  RunEvent
} from '@shared/types';
import type { DotsBridge } from '@shared/api';

declare global {
  interface Window {
    dots: DotsBridge;
  }
}

export type TabType = 'tasks' | 'memory' | 'files' | 'schedule' | 'settings';

interface Toast {
  id: string;
  level: 'info' | 'success' | 'error';
  text: string;
}

interface AppContextValue {
  bootstrap: Bootstrap | null;
  loading: boolean;
  activeDotId: string | null;
  setActiveDotId: (id: string | null) => void;
  activeDot: DotSummary | null;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  selectedRunId: string | null;
  setSelectedRunId: (id: string | null) => void;
  runs: Run[];
  activeRunEvents: RunEvent[];
  streamingDraft: string | null;
  approvals: ApprovalRequest[];
  auth: CodexAuthStatus | null;
  loginProgress: LoginProgress | null;
  settings: AppSettings | null;
  providers: ProviderProfile[];
  providerOptions: ProviderOption[];
  toasts: Toast[];
  showToast: (text: string, level?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: string) => void;
  showNewDotModal: boolean;
  setShowNewDotModal: (show: boolean) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (show: boolean) => void;
  showOnboardingModal: boolean;
  setShowOnboardingModal: (show: boolean) => void;
  refreshRuns: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  refreshProviders: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDotId, setActiveDotId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRunEvents, setActiveRunEvents] = useState<RunEvent[]>([]);
  const [streamingDraft, setStreamingDraft] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [auth, setAuth] = useState<CodexAuthStatus | null>(null);
  const [loginProgress, setLoginProgress] = useState<LoginProgress | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showNewDotModal, setShowNewDotModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  const showToast = useCallback((text: string, level: 'info' | 'success' | 'error' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, level, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await window.dots.api.getBootstrap();
      setBootstrap(data);
      setAuth(data.auth);
      setSettings(data.settings);
      setProviders(data.providers);
      setApprovals(data.approvals);

      if (!activeDotId && data.dots.length > 0) {
        setActiveDotId(data.dots[0].id);
      }

      // If user is not authenticated with Codex and has no providers and hasn't finished onboarding, trigger onboarding modal
      if (!data.settings.onboardingComplete && (!data.auth.loggedIn || !data.auth.installed) && data.providers.length === 0) {
        setShowOnboardingModal(true);
      }
    } catch (err) {
      console.error('Failed to load bootstrap', err);
    } finally {
      setLoading(false);
    }
  }, [activeDotId]);

  const refreshProviders = useCallback(async () => {
    try {
      const opts = await window.dots.api.listProviderOptions();
      setProviderOptions(opts);
    } catch (err) {
      console.error('Failed to list provider options', err);
    }
  }, []);

  const refreshRuns = useCallback(async () => {
    if (!activeDotId) {
      setRuns([]);
      return;
    }
    try {
      const list = await window.dots.api.listRuns(activeDotId, 50);
      setRuns(list);
      // Auto select the first run if none selected, or if selected run is from another dot
      setSelectedRunId((current) => {
        if (current && list.some((r) => r.id === current)) return current;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      console.error('Failed to list runs', err);
    }
  }, [activeDotId]);

  // Load bootstrap on mount
  useEffect(() => {
    refreshBootstrap();
    refreshProviders();
  }, [refreshBootstrap, refreshProviders]);

  // When active dot changes, refresh its runs
  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  // When selected run changes, load its events
  useEffect(() => {
    if (!selectedRunId) {
      setActiveRunEvents([]);
      setStreamingDraft(null);
      return;
    }
    window.dots.api
      .getRunEvents(selectedRunId)
      .then((events) => {
        setActiveRunEvents(events);
        setStreamingDraft(null);
      })
      .catch((err) => {
        console.error('Failed to load events', err);
      });
  }, [selectedRunId]);

  // Listen to main process push events
  useEffect(() => {
    const unsubscribe = window.dots.onEvent((event: PushEvent) => {
      switch (event.type) {
        case 'dot':
          setBootstrap((prev) => {
            if (!prev) return prev;
            const exists = prev.dots.some((d) => d.id === event.dot.id);
            const dots = exists ? prev.dots.map((d) => (d.id === event.dot.id ? event.dot : d)) : [...prev.dots, event.dot];
            return { ...prev, dots };
          });
          break;
        case 'dot-removed':
          setBootstrap((prev) => {
            if (!prev) return prev;
            return { ...prev, dots: prev.dots.filter((d) => d.id !== event.dotId) };
          });
          setActiveDotId((current) => (current === event.dotId ? null : current));
          break;
        case 'run':
          setRuns((prev) => {
            const exists = prev.some((r) => r.id === event.run.id);
            return exists ? prev.map((r) => (r.id === event.run.id ? event.run : r)) : [event.run, ...prev];
          });
          // If active dot is this run's dot, select it if none selected or if it's currently selected
          if (activeDotId === event.run.dotId) {
            setSelectedRunId((cur) => (!cur ? event.run.id : cur === event.run.id ? cur : cur));
          }
          break;
        case 'run-event':
          if (event.event.type === 'draft') {
            if (event.event.runId === selectedRunId) {
              setStreamingDraft(event.event.text);
            }
            break;
          }
          if (event.event.runId === selectedRunId) {
            setActiveRunEvents((prev) => [...prev, event.event]);
            setStreamingDraft(null);
          }
          break;
        case 'auth':
          setAuth(event.auth);
          setBootstrap((prev) => (prev ? { ...prev, auth: event.auth } : prev));
          refreshProviders();
          break;
        case 'login':
          setLoginProgress(event.progress);
          break;
        case 'settings':
          setSettings(event.settings);
          setBootstrap((prev) => (prev ? { ...prev, settings: event.settings } : prev));
          break;
        case 'providers':
          setProviders(event.providers);
          setBootstrap((prev) => (prev ? { ...prev, providers: event.providers } : prev));
          refreshProviders();
          break;
        case 'approval':
          setApprovals((prev) => [...prev, event.approval]);
          break;
        case 'approval-resolved':
          setApprovals((prev) => prev.filter((a) => a.id !== event.id));
          break;
        case 'toast':
          showToast(event.text, event.level);
          break;
        case 'navigate':
          if (event.dotId) setActiveDotId(event.dotId);
          if (event.runId) setSelectedRunId(event.runId);
          break;
      }
    });

    return () => unsubscribe();
  }, [activeDotId, selectedRunId, refreshProviders, showToast]);

  // Apply theme to document
  useEffect(() => {
    if (!settings) return;
    const theme = settings.theme;
    if (theme === 'system') {
      const preference = window.matchMedia('(prefers-color-scheme: dark)');
      const applyTheme = () => document.documentElement.setAttribute('data-theme', preference.matches ? 'dark' : 'light');
      applyTheme();
      preference.addEventListener('change', applyTheme);
      return () => preference.removeEventListener('change', applyTheme);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    return undefined;
  }, [settings?.theme]);

  const activeDot = useMemo(() => {
    return bootstrap?.dots.find((d) => d.id === activeDotId) ?? null;
  }, [bootstrap, activeDotId]);

  const value: AppContextValue = {
    bootstrap,
    loading,
    activeDotId,
    setActiveDotId,
    activeDot,
    activeTab,
    setActiveTab,
    selectedRunId,
    setSelectedRunId,
    runs,
    activeRunEvents,
    streamingDraft,
    approvals,
    auth,
    loginProgress,
    settings,
    providers,
    providerOptions,
    toasts,
    showToast,
    dismissToast,
    showNewDotModal,
    setShowNewDotModal,
    showSettingsModal,
    setShowSettingsModal,
    showOnboardingModal,
    setShowOnboardingModal,
    refreshRuns,
    refreshBootstrap,
    refreshProviders
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
