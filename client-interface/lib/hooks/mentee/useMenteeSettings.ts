/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback, type SetStateAction } from 'react';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { preferencesApi } from '@/lib/services/preferences-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validateProfileFields } from '@/lib/utils/validation';
import { toast } from 'sonner';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { useAuth } from '@/lib/context/AuthContext';

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

export interface MenteeProfileData {
  learningGoals: string;
  interests: string[];
  priorExperience: string;
  currentEducation: string;
  currentOccupation: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

export interface LearningPreferences {
  preferredLearningStyle: string;
  timeCommitment: number;
  preferredSchedule: string;
}

export interface UseMenteeSettingsReturn {
  loading: boolean;
  saving: boolean;
  activeTab: string;
  profileData: ProfileData;
  menteeProfile: MenteeProfileData;
  learningPreferences: LearningPreferences;
  setActiveTab: (tab: string) => void;
  setProfileData: React.Dispatch<React.SetStateAction<ProfileData>>;
  setMenteeProfile: React.Dispatch<React.SetStateAction<MenteeProfileData>>;
  setLearningPreferences: React.Dispatch<React.SetStateAction<LearningPreferences>>;
  handleProfileUpdate: () => Promise<void>;
  handleMenteeProfileUpdate: () => Promise<void>;
  handleLearningPreferencesUpdate: () => Promise<void>;
}

const DEFAULT_PROFILE: ProfileData = {
  firstName: '', lastName: '', email: '', phone: '', bio: '',
  city: '', country: '', languages: [], timezone: '',
};

const DEFAULT_MENTEE_PROFILE: MenteeProfileData = {
  learningGoals: '', interests: [], priorExperience: '', currentEducation: '',
  currentOccupation: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '',
};

const DEFAULT_LEARNING: LearningPreferences = {
  preferredLearningStyle: 'visual', timeCommitment: 10, preferredSchedule: 'flexible',
};

interface SettingsBundle {
  profile: ProfileData;
  menteeProfile: MenteeProfileData;
  learning: LearningPreferences;
}

const EMPTY: SettingsBundle = {
  profile: DEFAULT_PROFILE,
  menteeProfile: DEFAULT_MENTEE_PROFILE,
  learning: DEFAULT_LEARNING,
};

export function useMenteeSettings(): UseMenteeSettingsReturn {
  const { refreshUser } = useAuth();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const { data, loading } = useApiQuery<SettingsBundle>({
    queryKey: qk.profile.me,
    queryFn: async () => {
      const response = await apiClient.get(apiConfig.endpoints.profile);
      const d = response.data;
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
        menteeProfile: d.menteeProfile ? {
          learningGoals: d.menteeProfile.learningGoals || '',
          interests: d.menteeProfile.interests || [],
          priorExperience: d.menteeProfile.priorExperience || '',
          currentEducation: d.menteeProfile.currentEducation || '',
          currentOccupation: d.menteeProfile.currentOccupation || '',
          linkedinUrl: d.menteeProfile.linkedinUrl || '',
          githubUrl: d.menteeProfile.githubUrl || '',
          portfolioUrl: d.menteeProfile.portfolioUrl || '',
        } : DEFAULT_MENTEE_PROFILE,
        learning: { ...DEFAULT_LEARNING, ...(prefs?.learning && typeof prefs.learning === 'object' ? prefs.learning : {}) },
      };
    },
    errorMessage: 'Failed to load settings',
  });

  const server = data ?? EMPTY;

  // The form owns its edits; the query owns the saved truth. See useAdminSettings.
  const [profileDraft, setProfileDraft] = useState<ProfileData | null>(null);
  const [menteeDraft, setMenteeDraft] = useState<MenteeProfileData | null>(null);
  const [learningDraft, setLearningDraft] = useState<LearningPreferences | null>(null);

  const profileData = profileDraft ?? server.profile;
  const menteeProfile = menteeDraft ?? server.menteeProfile;
  const learningPreferences = learningDraft ?? server.learning;

  const setProfileData = useCallback((v: SetStateAction<ProfileData>) => {
    setProfileDraft((d) => (typeof v === 'function' ? (v as (p: ProfileData) => ProfileData)(d ?? server.profile) : v));
  }, [server.profile]);
  const setMenteeProfile = useCallback((v: SetStateAction<MenteeProfileData>) => {
    setMenteeDraft((d) => (typeof v === 'function' ? (v as (p: MenteeProfileData) => MenteeProfileData)(d ?? server.menteeProfile) : v));
  }, [server.menteeProfile]);
  const setLearningPreferences = useCallback((v: SetStateAction<LearningPreferences>) => {
    setLearningDraft((d) => (typeof v === 'function' ? (v as (p: LearningPreferences) => LearningPreferences)(d ?? server.learning) : v));
  }, [server.learning]);

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
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  }, [profileData, refreshUser, invalidate]);

  const handleMenteeProfileUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await apiClient.post(`${apiConfig.endpoints.profile}/complete-mentee`, menteeProfile);
      setMenteeDraft(null);
      await invalidate(qk.profile.me);
      toast.success('Mentee profile updated successfully');
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to update mentee profile'));
    } finally {
      setSaving(false);
    }
  }, [menteeProfile, invalidate]);

  const handleLearningPreferencesUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await preferencesApi.update('learning', learningPreferences as unknown as Record<string, unknown>);
      setLearningDraft(null);
      await invalidate(qk.profile.me);
      toast.success('Learning preferences saved');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to save learning preferences'));
    } finally {
      setSaving(false);
    }
  }, [learningPreferences, invalidate]);

  return {
    loading,
    saving,
    activeTab,
    profileData,
    menteeProfile,
    learningPreferences,
    setActiveTab,
    setProfileData,
    setMenteeProfile,
    setLearningPreferences,
    handleProfileUpdate,
    handleMenteeProfileUpdate,
    handleLearningPreferencesUpdate,
  };
}
