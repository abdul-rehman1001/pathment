'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { certificatesApi } from '@/lib/services/certificates-api';
import { TierCriteria } from '../certificate-constants';

interface UseCertificateQualificationsOptions {
  templateId: string | null;
  selectedProgramId: string;
  criteria: TierCriteria[];
  refreshKey: number;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
}

export function useCertificateQualifications({
  templateId,
  selectedProgramId,
  criteria,
  refreshKey,
  setRefreshKey
}: UseCertificateQualificationsOptions) {
  const [qualifiedData, setQualifiedData] = useState<Record<string, any[]>>({});
  const [loadingQualifications, setLoadingQualifications] = useState(false);
  const [criteriaTasks, setCriteriaTasks] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedMenteeIds, setSelectedMenteeIds] = useState<Set<string>>(new Set());
  const [adminTiers, setAdminTiers] = useState<Record<string, string>>({});
  const [issuing, setIssuing] = useState(false);
  const [sendingToMentors, setSendingToMentors] = useState(false);

  const [duplicateWarningModal, setDuplicateWarningModal] = useState<{
    isOpen: boolean;
    duplicates: Array<{ id: string; name: string; email: string; tier: string }>;
    allSelectedRecipients: Array<{ menteeId: string; tier: string }>;
  }>({
    isOpen: false,
    duplicates: [],
    allSelectedRecipients: []
  });

  useEffect(() => {
    if (!templateId || !selectedProgramId) return;

    const fetchQualifications = async () => {
      try {
        setLoadingQualifications(true);
        const res = await certificatesApi.getQualification(templateId, { programId: selectedProgramId });
        if (res.success && res.data) {
          setQualifiedData(res.data);
          if (res.criteriaTasks) {
            setCriteriaTasks(res.criteriaTasks);
          } else {
            setCriteriaTasks([]);
          }

          const activeList: any[] = [];
          const seenIds = new Set<string>();

          criteria.forEach(c => {
            const list = res.data[c.id] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          Object.keys(res.data).forEach(key => {
            if (key === 'mentors' || key === 'paused') return;
            const list = res.data[key] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          const mentorsList = res.data.mentors ?? [];

          const initialTiers: Record<string, string> = {};
          const autoSelected = new Set<string>();

          activeList.forEach(m => {
            const defTier = m.assignedTier || '';
            initialTiers[m.id] = defTier;

            const matchPercent = m.tierMatches?.[defTier] ?? 0;
            if (defTier && matchPercent >= 75) {
              autoSelected.add(m.id);
            }
          });

          const mentorDefaultTier = criteria[criteria.length - 1]?.id || 'participation';
          mentorsList.forEach(m => {
            initialTiers[m.id] = mentorDefaultTier;
            autoSelected.add(m.id);
          });

          setAdminTiers(initialTiers);
          setSelectedMenteeIds(autoSelected);
        }
      } catch (err) {
        console.error('Failed to calculate qualification counts:', err);
      } finally {
        setLoadingQualifications(false);
      }
    };

    fetchQualifications();
  }, [templateId, selectedProgramId, refreshKey]);

  const executeIssuance = async (recipientsList: Array<{ menteeId: string; tier: string }>) => {
    try {
      setIssuing(true);
      const res = await certificatesApi.issueCertificates({
        templateId: templateId!,
        recipients: recipientsList
      });
      if (res.success) {
        toast.success(`Successfully enqueued ${recipientsList.length} certificate(s) for rendering!`);
        setSelectedMenteeIds(new Set());
        setRefreshKey(prev => prev + 1);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue certificates');
    } finally {
      setIssuing(false);
    }
  };

  const handleIssue = async () => {
    if (selectedMenteeIds.size === 0) {
      toast.error('Please select at least one mentee to issue certificates');
      return;
    }

    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    const recipients = Array.from(selectedMenteeIds).map(id => ({
      menteeId: id,
      tier: adminTiers[id] ?? defaultTier
    }));

    const allMentees: any[] = [];
    const seenIds = new Set<string>();
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seenIds.has(m.id)) { seenIds.add(m.id); allMentees.push(m); }
      });
    });
    const allMentors: any[] = qualifiedData.mentors ?? [];
    const allActiveRecipients = [...allMentees, ...allMentors];

    const duplicates: Array<{ id: string; name: string; email: string; tier: string }> = [];
    recipients.forEach(r => {
      const menteeObj = allActiveRecipients.find(m => m.id === r.menteeId);
      if (menteeObj && Array.isArray(menteeObj.issuedTiers) && menteeObj.issuedTiers.includes(r.tier)) {
        duplicates.push({
          id: menteeObj.id,
          name: `${menteeObj.firstName ?? ''} ${menteeObj.lastName ?? ''}`.trim() || menteeObj.email,
          email: menteeObj.email,
          tier: r.tier
        });
      }
    });

    if (duplicates.length > 0) {
      setDuplicateWarningModal({
        isOpen: true,
        duplicates,
        allSelectedRecipients: recipients
      });
    } else {
      await executeIssuance(recipients);
    }
  };

  const handleSendToMentors = async () => {
    if (!templateId || !selectedProgramId) return;
    try {
      setSendingToMentors(true);
      const res = await certificatesApi.sendToMentors(templateId, selectedProgramId);
      if (res.success) toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to mentors');
    } finally {
      setSendingToMentors(false);
    }
  };

  return {
    qualifiedData,
    setQualifiedData,
    loadingQualifications,
    criteriaTasks,
    selectedMenteeIds,
    setSelectedMenteeIds,
    adminTiers,
    setAdminTiers,
    issuing,
    sendingToMentors,
    handleIssue,
    executeIssuance,
    handleSendToMentors,
    duplicateWarningModal,
    setDuplicateWarningModal
  };
}
