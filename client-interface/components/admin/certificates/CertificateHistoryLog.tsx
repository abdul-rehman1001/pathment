'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Loader2, Award, RefreshCw, RotateCw, Trash2, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { certificatesApi } from '@/lib/services/certificates-api';
import { ConfirmModal } from '@/components/shared';

type HistoryItem = {
  id:        string;
  tier:      string;
  createdAt: string;
  status:    'issued';
  recipient: { id: string; firstName: string; lastName: string; email: string; role: string } | null;
  issuedBy:  { id: string; firstName: string; lastName: string; email: string; role: string } | null;
};

interface CertificateHistoryLogProps {
  templateId: string;
  userRole:   'admin' | 'mentor';
}

export default function CertificateHistoryLog({ templateId, userRole }: CertificateHistoryLogProps) {
  const [history,    setHistory]    = useState<HistoryItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [criteria,   setCriteria]   = useState<Array<{ id: string; name: string }>>([]);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen:        boolean;
    title:         string;
    message:       string;
    confirmLabel?: string;
    cancelLabel?:  string;
    type?:         'warning' | 'danger' | 'info';
    onConfirm:     () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchHistory = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await certificatesApi.getTemplateHistory(templateId);
      if (res.success && res.data) setHistory(res.data as unknown as HistoryItem[]);
    } catch (err) {
      console.error('Failed to load certificate history:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchTemplateCriteria = async () => {
    try {
      const res = await certificatesApi.getTemplate(templateId);
      if (res.success && res.data?.criteria) setCriteria(res.data.criteria);
    } catch (err) {
      console.error('Failed to load criteria:', err);
    }
  };

  useEffect(() => {
    fetchHistory(true);
    fetchTemplateCriteria();
  }, [templateId]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return history;
    return history.filter(item => {
      const recipientName  = item.recipient ? `${item.recipient.firstName} ${item.recipient.lastName}`.toLowerCase() : '';
      const recipientEmail = item.recipient?.email?.toLowerCase() ?? '';
      const issuerName     = item.issuedBy ? `${item.issuedBy.firstName} ${item.issuedBy.lastName}`.toLowerCase() : '';
      const issuerEmail    = item.issuedBy?.email?.toLowerCase() ?? '';
      return recipientName.includes(q) || recipientEmail.includes(q) || issuerName.includes(q) || issuerEmail.includes(q);
    });
  }, [history, search]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleResend = (id: string) => {
    setConfirmConfig({
      isOpen:       true,
      title:        'Resend Certificate Notification?',
      message:      'This will resend the certificate email and in-app notification to the recipient. Their certificate is already available in their dashboard.',
      confirmLabel: 'Resend Notification',
      cancelLabel:  'Cancel',
      type:         'info',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setActioningId(id);
          await certificatesApi.resendCertificateInstance(id);
          toast.success('Notification resent successfully!');
        } catch (err: any) {
          toast.error(err.message || 'Failed to resend notification');
        } finally {
          setActioningId(null);
        }
      }
    });
  };

  const handleRevoke = (id: string) => {
    setConfirmConfig({
      isOpen:       true,
      title:        'Revoke Certificate?',
      message:      'Are you sure you want to revoke and delete this certificate? This action is permanent and cannot be undone.',
      confirmLabel: 'Revoke',
      cancelLabel:  'Keep Certificate',
      type:         'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setActioningId(id);
          const res = await certificatesApi.deleteCertificateInstance(id);
          if (res.success) {
            toast.success('Certificate revoked successfully!');
            setHistory(prev => prev.filter(item => item.id !== id));
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke certificate');
        } finally {
          setActioningId(null);
        }
      }
    });
  };

  const handleRevokeAll = () => {
    setConfirmConfig({
      isOpen:       true,
      title:        'REVOKE ALL CERTIFICATES?',
      message:      'This will permanently delete ALL certificates issued under this template. This cannot be undone.',
      confirmLabel: 'Revoke All',
      cancelLabel:  'Cancel',
      type:         'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          const res = await certificatesApi.revokeAllTemplateCertificates(templateId);
          if (res.success) {
            toast.success('All certificates revoked successfully!');
            setHistory([]);
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke certificates');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleResendAll = () => {
    setConfirmConfig({
      isOpen:       true,
      title:        'Resend Notifications to All Recipients?',
      message:      'This will resend the certificate email and in-app notification to every recipient under this template.',
      confirmLabel: 'Resend All Notifications',
      cancelLabel:  'Cancel',
      type:         'info',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          await certificatesApi.resendAllTemplateCertificates(templateId, false);
          toast.success('Notifications queued for all recipients!');
        } catch (err: any) {
          toast.error(err.message || 'Failed to resend notifications');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'gold':   return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'silver': return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
      case 'bronze': return 'text-amber-700 bg-amber-700/10 border-amber-700/20';
      default:       return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getTierName = (tierId: string) => {
    const match = criteria.find(c => c.id === tierId);
    return match ? match.name : tierId.charAt(0).toUpperCase() + tierId.slice(1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipients or issuers by name or email..."
            className="w-full pl-8 pr-3.5 py-2.5 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchHistory(false)}
            className="p-2.5 bg-background border border-border hover:bg-muted text-foreground rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>

          {history.length > 0 && (
            <button
              type="button"
              onClick={handleResendAll}
              className="px-3.5 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 border border-indigo-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Resend notification to all recipients"
            >
              <RotateCw className="w-4 h-4" />
              Resend All
            </button>
          )}

          {history.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAll}
              className="px-3.5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Revoke all certificates"
            >
              <Trash2 className="w-4 h-4" />
              Revoke All
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-xs text-muted-foreground font-semibold">
          {search ? 'No recipients match your search.' : 'No certificates issued under this template yet.'}
        </div>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider items-center">
            <div className="col-span-3">Recipient</div>
            <div className="col-span-2 text-center">Badge Tier</div>
            <div className="col-span-3">Issued By</div>
            <div className="col-span-2 text-center">Issued Date</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="max-h-[350px] overflow-y-auto divide-y divide-border">
            {filtered.map(item => {
              const dateStr = new Date(item.createdAt).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
              });

              return (
                <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center text-xs hover:bg-muted/10 transition-colors">
                  {/* Recipient */}
                  <div className="col-span-3 min-w-0">
                    <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">
                        {item.recipient
                          ? `${item.recipient.firstName} ${item.recipient.lastName}`
                          : 'Deleted User'}
                      </span>
                      {userRole === 'admin' && item.recipient && (
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                          item.recipient.role === 'mentor'
                            ? 'bg-indigo-500/10 text-indigo-600'
                            : 'bg-brand-500/10 text-brand-600'
                        }`}>
                          {item.recipient.role}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {item.recipient?.email || 'N/A'}
                    </div>
                  </div>

                  {/* Tier */}
                  <div className="col-span-2 flex justify-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-full text-[10px] font-bold uppercase tracking-wider ${getTierColor(item.tier)}`}>
                      <Award className="w-3.5 h-3.5" /> {getTierName(item.tier)}
                    </span>
                  </div>

                  {/* Issued By */}
                  <div className="col-span-3 min-w-0">
                    {item.issuedBy ? (
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">
                            {item.issuedBy.firstName} {item.issuedBy.lastName}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                            item.issuedBy.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
                          }`}>
                            {item.issuedBy.role || 'Admin'}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {item.issuedBy.email}
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground font-semibold text-[11px]">
                        System Admin
                      </div>
                    )}
                  </div>

                  {/* Date */}
                  <div className="col-span-2 text-center text-muted-foreground font-semibold text-[11px]">
                    {dateStr}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleResend(item.id)}
                      disabled={actioningId !== null}
                      className="p-1.5 bg-background border border-border hover:border-brand-500/30 hover:bg-brand-500/5 text-muted-foreground hover:text-brand-600 rounded-xl transition-all disabled:opacity-50"
                      title="Resend Notification"
                    >
                      {actioningId === item.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCw className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRevoke(item.id)}
                      disabled={actioningId !== null}
                      className="p-1.5 bg-background border border-border hover:border-red-500/30 hover:bg-red-500/5 text-muted-foreground hover:text-red-500 rounded-xl transition-all disabled:opacity-50"
                      title="Revoke Certificate"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmConfig}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
