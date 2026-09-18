'use client';

import { useState, useCallback, type SetStateAction } from 'react';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { useAuth } from '@/lib/context/AuthContext';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validateProfileFields } from '@/lib/utils/validation';
import { preferencesApi } from '@/lib/services/preferences-api';
import { toast } from 'sonner';

export interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  city: string;
  country: string;
  languages: string[];
  timezone: string;
}

export interface SystemSettings {
  autoApproveEnrollments: boolean;
  allowSelfRegistration: boolean;
  maintenanceMode: boolean;
  requireEmailVerification: boolean;
  maxProgramsPerMentee: number;
}

export interface UserManagementSettings {
  allowMentorSelfAssignment: boolean;
  requireMentorApproval: boolean;
  autoMatchAlgorithm: boolean;
  minMentorExperience: number;
}

const DEFAULT_PROFILE: ProfileData = { firstName: '', lastName: '', email: '', phone: '', bio: '', city: '', country: '', languages: [], timezone: '' };

const DEFAULT_SYSTEM: SystemSettings = {
  autoApproveEnrollments: false,
  allowSelfRegistration: true,
  maintenanceMode: false,
  requireEmailVerification: true,
  maxProgramsPerMentee: 3,
};

const DEFAULT_USER_MGMT: UserManagementSettings = {
  allowMentorSelfAssignment: false,
  requireMentorApproval: true,
  autoMatchAlgorithm: true,
  minMentorExperience: 2,
};

interface UseAdminSettingsReturn {
  loading: boolean;
  saving: boolean;
  profileData: ProfileData;
  systemSettings: SystemSettings;
  userManagementSettings: UserManagementSettings;
  setProfileData: React.Dispatch<React.SetStateAction<ProfileData>>;
  setSystemSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  setUserManagementSettings: React.Dispatch<React.SetStateAction<UserManagementSettings>>;
  handleProfileUpdate: () => Promise<void>;
  handleSystemSettingsUpdate: () => Promise<void>;
  handleUserManagementUpdate: () => Promise<void>;
}

interface SettingsBundle {
  profile: ProfileData;
  system: SystemSettings;
  userManagement: UserManagementSettings;
}

const EMPTY: SettingsBundle = {
  profile: DEFAULT_PROFILE,
  system: DEFAULT_SYSTEM,
  userManagement: DEFAULT_USER_MGMT,
};

export function useAdminSettings(): UseAdminSettingsReturn {
  const { refreshUser } = useAuth();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);

  const { data, loading } = useApiQuery<SettingsBundle>({
    queryKey: qk.profile.me,
    queryFn: async () => {
      const response = await apiClient.get(apiConfig.endpoints.profile);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = ((response as any).data ?? response) as any;
      const prefs = d.settings?.preferences;
      return {
        profile: {
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          email: d.email || '',
          phone: d.phone || '',
          bio: d.bio || '',
          city: d.city || '',
          country: d.country || '',
          languages: Array.isArray(d.languages) ? d.languages : [],
          timezone: d.settings?.timezone || '',
        },
        system: { ...DEFAULT_SYSTEM, ...(prefs?.system && typeof prefs.system === 'object' ? prefs.system : {}) },
        userManagement: { ...DEFAULT_USER_MGMT, ...(prefs?.userManagement && typeof prefs.userManagement === 'object' ? prefs.userManagement : {}) },
      };
    },
    errorMessage: 'Failed to load settings',
  });

  const server = data ?? EMPTY;

  // The form owns its edits; the query owns the saved truth. Holding the draft
  // separately (rather than copying the server value into state on load) means
  // there is no effect to fall out of step, and a successful save just drops the
  // draft so the refetched value becomes authoritative again.
  const [profileDraft, setProfileDraft] = useState<ProfileData | null>(null);
  const [systemDraft, setSystemDraft] = useState<SystemSettings | null>(null);
  const [userMgmtDraft, setUserMgmtDraft] = useState<UserManagementSettings | null>(null);

  const profileData = profileDraft ?? server.profile;
  const systemSettings = systemDraft ?? server.system;
  const userManagementSettings = userMgmtDraft ?? server.userManagement;

  // Keep the public setters' shape (value OR updater); resolve an updater
  // against the effective value so callers never see the draft's null.
  const setProfileData = useCallback((v: SetStateAction<ProfileData>) => {
    setProfileDraft((d) => (typeof v === 'function' ? (v as (p: ProfileData) => ProfileData)(d ?? server.profile) : v));
  }, [server.profile]);
  const setSystemSettings = useCallback((v: SetStateAction<SystemSettings>) => {
    setSystemDraft((d) => (typeof v === 'function' ? (v as (p: SystemSettings) => SystemSettings)(d ?? server.system) : v));
  }, [server.system]);
  const setUserManagementSettings = useCallback((v: SetStateAction<UserManagementSettings>) => {
    setUserMgmtDraft((d) => (typeof v === 'function' ? (v as (p: UserManagementSettings) => UserManagementSettings)(d ?? server.userManagement) : v));
  }, [server.userManagement]);

  const handleProfileUpdate = useCallback(async () => {
    const invalid = validateProfileFields(profileData);
    if (invalid) { toast.error(invalid); return; }
    try {
      setSaving(true);
      await apiClient.put(apiConfig.endpoints.profile, profileData);
      await refreshUser();
      setProfileDraft(null);
      await invalidate(qk.profile.me);
      toast.success('Profile updated successfully');
    } catch (err: unknown) {
      console.error('Failed to update profile:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  }, [profileData, refreshUser, invalidate]);

  const handleSystemSettingsUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await preferencesApi.update('system', systemSettings as unknown as Record<string, unknown>);
      setSystemDraft(null);
      await invalidate(qk.profile.me);
      toast.success('System settings saved');
    } catch (err: unknown) {
      console.error('Failed to update system settings:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to save system settings'));
    } finally {
      setSaving(false);
    }
  }, [systemSettings, invalidate]);

  const handleUserManagementUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await preferencesApi.update('userManagement', userManagementSettings as unknown as Record<string, unknown>);
      setUserMgmtDraft(null);
      await invalidate(qk.profile.me);
      toast.success('User management settings saved');
    } catch (err: unknown) {
      console.error('Failed to update user management:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to save user management settings'));
    } finally {
      setSaving(false);
    }
  }, [userManagementSettings, invalidate]);

  return {
    loading,
    saving,
    profileData,
    systemSettings,
    userManagementSettings,
    setProfileData,
    setSystemSettings,
    setUserManagementSettings,
    handleProfileUpdate,
    handleSystemSettingsUpdate,
    handleUserManagementUpdate,
  };
}
