import { apiClient } from './api-client';

export interface BadgeProgress {
  badgeId: string;
  name: string;
  iconUrl?: string | null;
  criteriaType: string;
  current: number;
  target: number;
  earned: boolean;
  percent: number;
}

export interface GamificationStats {
  totalPoints: number;
  xp?: number;
  currentLevel: number;
  currentStreak: number;
  longestStreak: number;
  totalBadges: number;
  totalTasksCompleted: number;
  totalProgramsCompleted: number;
  avgTaskRating: number;
  leaderboardRank: number | null;
  progressScore?: number | null;
  coinsEarned?: number;
  coinsSpent?: number;
  coinsBalance?: number;
  badgeProgress?: BadgeProgress[];
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  category: string;
  criteriaType?: string;
  criteriaValue?: Record<string, unknown>;
  pointsReward: number;
  isSecret: boolean;
  isActive?: boolean;
  iconUrl?: string | null;
  unlockedAt?: string;
}

export type BadgeCriteriaType =
  | 'points_milestone'
  | 'coins_earned'
  | 'tasks_completed'
  | 'programs_completed'
  | 'streak_days'
  | 'avg_rating'
  | 'level_reached'
  | 'custom'
  | 'reviews_given'
  | 'tasks_approved'
  | 'meetings_logged'
  | 'mentees_guided'
  | 'clans_led'
  | 'mentor_avg_rating';

interface UserBadgeApiItem {
  id: string;
  unlockedAt?: string;
  badge?: Badge;
  Badge?: Badge;
}

export interface PointsHistoryEntry {
  id: string;
  userId?: string;
  pointsChange: number;
  pointsBefore: number;
  pointsAfter: number;
  sourceType: string;
  sourceId?: string | null;
  reason?: string | null;
  acknowledged?: boolean;
  createdAt: string;
}

export type PointHistoryItem = PointsHistoryEntry;

export interface LeaderboardEntry {
  id: string;
  userId: string;
  rank: number;
  /** The progress score — the same number the mentor portal shows. */
  score: number;
  /** Its band: Exceptional, Excellent, Strong, Developing, Needs attention. */
  band?: string;
  tasksCompleted?: number;
  onTimeRate?: number | null;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  statusCode: number;
  data: T;
}

export const gamificationApi = {
  async getUserStats(userId: string): Promise<GamificationStats> {
    const response = await apiClient.get<ApiResponse<{ stats: GamificationStats }>>(
      `/gamification/user/${userId}/stats`
    );
    return response.data.stats;
  },

  async getUserBadges(userId: string): Promise<Badge[]> {
    const response = await apiClient.get<ApiResponse<{ badges: (UserBadgeApiItem | Badge)[] }>>(
      `/gamification/user/${userId}/badges`
    );

    const mapped: Badge[] = [];

    for (const item of response.data.badges || []) {
      // Server now returns flat badge DTOs; keep nested UserBadge support.
      const nested =
        (item as UserBadgeApiItem).badge ||
        (item as UserBadgeApiItem).Badge ||
        (('name' in item && (item as Badge).name) ? (item as Badge) : null);
      if (!nested?.name) continue;

      mapped.push({
        ...nested,
        unlockedAt: (item as UserBadgeApiItem).unlockedAt || nested.unlockedAt,
      });
    }

    return mapped;
  },

  async getUserPointsHistory(userId: string, limit = 20): Promise<PointsHistoryEntry[]> {
    const response = await apiClient.get<ApiResponse<{ history: PointsHistoryEntry[] }>>(
      `/gamification/user/${userId}/points-history`,
      { params: { limit } }
    );
    return response.data.history;
  },

  async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const response = await apiClient.get<ApiResponse<{ leaderboard: LeaderboardEntry[] }>>(
      '/gamification/leaderboard',
      { params: { limit } }
    );
    return response.data.leaderboard;
  },

  async listBadges(params?: { active?: boolean; role?: 'mentee' | 'mentor' }): Promise<Badge[]> {
    const response = await apiClient.get<ApiResponse<{ badges: Badge[] }>>('/gamification/badges', {
      params: {
        active: params?.active === false ? 'false' : 'true',
        role: params?.role,
      },
    });
    return response.data.badges || [];
  },

  async createBadge(payload: {
    name: string;
    description: string;
    category?: string;
    criteriaType: BadgeCriteriaType;
    criteriaValue: Record<string, unknown>;
    pointsReward?: number;
    isActive?: boolean;
    isSecret?: boolean;
    iconUrl?: string | null;
  }): Promise<Badge> {
    const response = await apiClient.post<ApiResponse<{ badge: Badge }>>('/gamification/badges', payload);
    return response.data.badge;
  },

  async updateBadge(badgeId: string, payload: Partial<{
    name: string;
    description: string;
    category: string;
    criteriaType: BadgeCriteriaType;
    criteriaValue: Record<string, unknown>;
    pointsReward: number;
    isActive: boolean;
    isSecret: boolean;
    iconUrl: string | null;
    targetRole: 'mentee' | 'mentor';
  }>): Promise<Badge> {
    const response = await apiClient.patch<ApiResponse<{ badge: Badge }>>(`/gamification/badges/${badgeId}`, payload);
    return response.data.badge;
  },

  async awardBadge(userId: string, badgeId: string): Promise<void> {
    await apiClient.post('/gamification/badges/award', { userId, badgeId });
  },
};

export default gamificationApi;
