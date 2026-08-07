/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { taskApi } from '@/lib/services/task-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';

export type TaskView = 'active' | 'completed';

export interface UseMenteeTasksReturn {
  tasks: any[];
  filteredTasks: any[];
  stats: any;
  loading: boolean;
  enrollments: any[];
  selectedEnrollmentId: string | null;
  filterStatus: string;
  searchTerm: string;
  view: TaskView;
  activeCount: number;
  completedCount: number;
  setSelectedEnrollmentId: (id: string | null) => void;
  setFilterStatus: (status: string) => void;
  setSearchTerm: (term: string) => void;
  setView: (view: TaskView) => void;
  handleStartTask: (taskId: string) => Promise<void>;
  fetchTasks: () => Promise<void>;
}

export function useMenteeTasks(): UseMenteeTasksReturn {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [enrollmentsReady, setEnrollmentsReady] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<TaskView>('active');

  const fetchEnrollments = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await enrollmentApi.getAll({ menteeId: user.id });
      const list: any[] = res?.data?.enrollments || [];
      setEnrollments(list);
      // Auto-select first active/in_progress enrollment
      const active =
        list.find((e: any) => ['active', 'matched'].includes(e.status)) || list[0];
      if (active) {
        setSelectedEnrollmentId(active.id);
      }
    } catch (err: any) {
      console.error('Failed to fetch enrollments:', err);
    } finally {
      setEnrollmentsReady(true);
    }
  }, [user?.id]);

  const fetchTasks = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      const statsRes = await taskApi.getMenteeTaskStats(user.id, selectedEnrollmentId ?? undefined);
      setStats(statsRes?.data?.stats);

      const params: any = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (selectedEnrollmentId) params.enrollmentId = selectedEnrollmentId;

      const tasksRes = await taskApi.getMenteeTasks(user.id, params);
      setTasks(tasksRes.data.tasks || []);
    } catch (err: any) {
      console.error('Failed to fetch tasks:', err);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [user?.id, filterStatus, selectedEnrollmentId]);

  // Load enrollments once on mount
  useEffect(() => {
    if (user?.id) fetchEnrollments();
  }, [user?.id, fetchEnrollments]);

  // Re-fetch tasks when filter or program selection changes - only after enrollments are loaded
  useEffect(() => {
    if (user?.id && enrollmentsReady) fetchTasks();
  }, [user?.id, filterStatus, selectedEnrollmentId, fetchTasks, enrollmentsReady]);

  const handleStartTask = useCallback(async (taskId: string) => {
    try {
      await taskApi.updateTaskStatus(taskId, 'in_progress');
      toast.success('Task started!');
      fetchTasks();
    } catch {
      toast.error('Failed to start task');
    }
  }, [fetchTasks]);

  const changeView = useCallback((next: TaskView) => {
    setView(next);
    // A completed/active split is meaningless if a conflicting status filter is
    // still applied, so clear it whenever the view flips.
    setFilterStatus('all');
  }, []);

  const isActiveStatus = (status: string) =>
    ['assigned', 'in_progress', 'submitted', 'revision_needed'].includes(status);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (view === 'completed') {
      list = list.filter((task) => task.status === 'completed');
    } else {
      list = list.filter((task) => isActiveStatus(task.status));
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(
        (task) =>
          task.roadmapTask?.title?.toLowerCase().includes(lower) ||
          task.roadmapTask?.description?.toLowerCase().includes(lower)
      );
    }
    // Active view: actionable, due-soonest tasks first (overdue > due date > none).
    if (view === 'active') {
      list = [...list].sort((a: any, b: any) => {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      });
    }
    return list;
  }, [tasks, view, searchTerm]);

  const activeCount = useMemo(
    () => tasks.filter((task) => isActiveStatus(task.status)).length,
    [tasks]
  );
  const completedCount = useMemo(
    () => tasks.filter((task) => task.status === 'completed').length,
    [tasks]
  );

  return {
    tasks,
    filteredTasks,
    stats,
    loading,
    enrollments,
    selectedEnrollmentId,
    filterStatus,
    searchTerm,
    view,
    activeCount,
    completedCount,
    setSelectedEnrollmentId,
    setFilterStatus,
    setSearchTerm,
    setView: changeView,
    handleStartTask,
    fetchTasks,
  };
}
