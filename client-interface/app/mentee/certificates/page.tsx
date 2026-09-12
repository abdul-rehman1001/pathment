'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';
import {
  Award, Download, Linkedin,
  Loader2, Calendar, ShieldCheck, X, Eye
} from 'lucide-react';
import { certificatesApi, CertificateInstance } from '@/lib/services/certificates-api';
import { CertificatePreview, type CertificateRenderData } from '@/components/certificates/shared';
import { downloadCertificateAsPng } from '@/lib/utils/certificate-renderer';

// ==================== HELPERS ====================

function buildRenderData(cert: CertificateInstance, menteeName: string): CertificateRenderData {
  return {
    menteeName,
    programName:    cert.template?.program?.name || cert.template?.name,
    fellowshipName: cert.template?.program?.name || cert.template?.name,
    dateIssued:     new Date(cert.createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    issuerName:  cert.mentor
      ? `${cert.mentor.firstName} ${cert.mentor.lastName}`.trim()
      : 'Pathment Admin',
    issuerTitle: cert.mentor ? 'Mentor' : 'Pathment Admin',
  };
}

function getBadgeUrl(cert: CertificateInstance): string | null {
  const criteria = cert.template?.criteria;
  if (!Array.isArray(criteria)) return null;
  return criteria.find(c => c.id === cert.tier)?.badgeUrl ?? null;
}

function getLinkedInShareUrl(cert: CertificateInstance): string {
  const title = `Awarded: ${cert.template?.name || 'Certificate of Mastery'} from Pathment`;
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&title=${encodeURIComponent(title)}`;
}

// ==================== PAGE ====================

export default function MenteeCertificatesPage() {
  const { user }     = useAuth();
  const [certificates, setCertificates] = useState<CertificateInstance[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [previewCert,  setPreviewCert]  = useState<CertificateInstance | null>(null);
  const [downloading,  setDownloading]  = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCertificates = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const res = await certificatesApi.listMenteeCertificates(user.id);
      if (res.success && res.data) setCertificates(res.data);
    } catch (err: any) {
      toast.error('Failed to load your certificates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCertificates(); }, [user?.id]);

  // ── Download ───────────────────────────────────────────────────────────────

  const handleDownload = async (cert: CertificateInstance) => {
    if (!cert.template) { toast.error('Certificate template not loaded'); return; }
    if (downloading) return;
    setDownloading(cert.id);
    try {
      const menteeName = user
        ? `${user.firstName} ${user.lastName}`.trim()
        : 'Recipient';
      const data    = buildRenderData(cert, menteeName);
      const badge   = getBadgeUrl(cert);
      const name    = (cert.template.name || 'certificate').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
      await downloadCertificateAsPng(cert.template, data, `${name}.png`, badge);
      toast.success('Certificate downloaded!');
    } catch (err: any) {
      console.error(err);
      toast.error('Download failed — please try again');
    } finally {
      setDownloading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderMenteeName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : 'Recipient';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Award className="w-6 h-6 text-brand-500" />
          My Certificates
        </h1>
        <p className="text-xs text-muted-foreground">View, download, and share your earned accomplishments</p>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
          <span className="text-sm text-muted-foreground font-medium">Loading your certificates...</span>
        </div>
      ) : certificates.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-2xl p-8 bg-card text-center">
          <Award className="w-12 h-12 text-brand-500 mb-3 opacity-60" />
          <h3 className="text-sm font-bold text-foreground mb-1">No Certificates Yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Keep working on your milestones! Your mentor will award you certificates as you complete your program targets.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certificates.map(cert => {
            const dateStr = new Date(cert.createdAt).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            });
            const renderData   = buildRenderData(cert, renderMenteeName);
            const badgeUrl     = getBadgeUrl(cert);
            const isDownloading = downloading === cert.id;

            return (
              <div
                key={cert.id}
                className="group bg-card border border-border rounded-2xl overflow-hidden shadow-2xs hover:shadow-xs transition-all flex flex-col cursor-pointer"
                onClick={() => setPreviewCert(cert)}
              >
                {/* Live certificate preview (replaces stored imageUrl thumbnail) */}
                <div className="relative bg-muted overflow-hidden border-b border-border">
                  {cert.template ? (
                    <CertificatePreview
                      template={cert.template}
                      recipientData={renderData}
                      badgeUrlOverride={badgeUrl}
                    />
                  ) : (
                    <div className="aspect-[1.777] flex items-center justify-center text-muted-foreground text-xs">
                      No preview
                    </div>
                  )}
                  {/* hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <span className="bg-white/90 dark:bg-black/90 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm">
                      <Eye className="w-4 h-4 text-brand-500" /> View Certificate
                    </span>
                  </div>
                </div>

                {/* Card footer */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="space-y-1">
                    <h3
                      className="text-xs font-bold text-foreground line-clamp-1 hover:text-brand-500 transition-colors cursor-pointer"
                      onClick={() => setPreviewCert(cert)}
                    >
                      {cert.template?.name || 'Certificate of Completion'}
                    </h3>
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-semibold">
                        <Calendar className="w-3 h-3 text-brand-500" /> Issued: {dateStr}
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-semibold">
                        <ShieldCheck className="w-3 h-3 text-brand-500" />
                        Verified by: {cert.mentor ? `${cert.mentor.firstName} ${cert.mentor.lastName}` : 'Pathment Admin'}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPreviewCert(cert)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[10px] font-bold transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>

                    <button
                      onClick={() => handleDownload(cert)}
                      disabled={isDownloading}
                      className="p-2 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-0.5 disabled:opacity-60"
                      title="Download PNG"
                    >
                      {isDownloading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                      <span className="text-[9px] font-bold">PNG</span>
                    </button>

                    <a
                      href={getLinkedInShareUrl(cert)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/20 text-[#0a66c2] rounded-xl transition-colors border border-transparent flex items-center justify-center"
                      title="Share on LinkedIn"
                      onClick={e => e.stopPropagation()}
                    >
                      <Linkedin className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-screen preview modal */}
      {previewCert && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-start md:justify-center overflow-y-auto bg-black/90 backdrop-blur-md p-4 md:p-6 animate-fade-in"
          onClick={() => setPreviewCert(null)}
        >
          <button
            onClick={() => setPreviewCert(null)}
            className="fixed top-4 right-4 z-50 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/10 shadow-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div
            className="w-full max-w-3xl lg:max-w-4xl flex flex-col items-center gap-4 my-auto py-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Live full-screen preview */}
            <div className="w-full border border-white/10 rounded-2xl overflow-hidden shadow-2xl bg-black/40">
              {previewCert.template ? (
                <CertificatePreview
                  template={previewCert.template}
                  recipientData={buildRenderData(previewCert, renderMenteeName)}
                  badgeUrlOverride={getBadgeUrl(previewCert)}
                />
              ) : (
                <div className="aspect-[1.777] flex items-center justify-center text-white/40 text-sm">
                  Template not available
                </div>
              )}
            </div>

            {/* Combined Title & Action Bar */}
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/10 border border-white/15 p-4 rounded-2xl backdrop-blur-md shadow-xl select-none">
              <div className="text-center sm:text-left space-y-0.5">
                <h2 className="text-white text-sm md:text-base font-bold">
                  {previewCert.template?.name || 'Certificate of Mastery'}
                </h2>
                <p className="text-white/70 text-[11px] font-medium">
                  Issued by {previewCert.mentor
                    ? `${previewCert.mentor.firstName} ${previewCert.mentor.lastName}`
                    : 'Pathment Admin'}
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => handleDownload(previewCert)}
                  disabled={!!downloading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-white/90 text-black rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {downloading === previewCert.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Download className="w-4 h-4" />}
                  Download PNG
                </button>

                <a
                  href={getLinkedInShareUrl(previewCert)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0a66c2] hover:bg-[#0b74de] text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Linkedin className="w-4 h-4" /> Share
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
