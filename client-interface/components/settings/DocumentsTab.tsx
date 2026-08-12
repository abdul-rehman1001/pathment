'use client';

import { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Bot, BookOpenCheck, HelpCircle, Lightbulb } from 'lucide-react';
import { messagingApi } from '@/lib/services/messaging-api';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/admin/ui';

interface Document {
  id: string;
  fileName: string;
  status: 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

interface DocumentsTabProps {
  autoReplyEnabled?: boolean;
  onAutoReplyChange?: (enabled: boolean) => Promise<void> | void;
}

export function DocumentsTab({ autoReplyEnabled = false, onAutoReplyChange }: DocumentsTabProps = {}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleAutoReply = async () => {
    if (!onAutoReplyChange) return;
    setToggling(true);
    try {
      await onAutoReplyChange(!autoReplyEnabled);
    } finally {
      setToggling(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const data = await messagingApi.getMentorDocuments();
      setDocuments(data);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // Poll every 10s if any doc is 'processing'
    const interval = setInterval(() => {
      setDocuments((currentDocs) => {
        if (currentDocs.some((d) => d.status === 'processing')) {
          fetchDocuments();
        }
        return currentDocs;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported.');
      return;
    }

    setUploading(true);
    try {
      await messagingApi.uploadMentorDocument(file);
      toast.success('Document uploaded successfully. It is now processing.');
      await fetchDocuments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDocumentId) return;
    setDeleting(true);
    try {
      await messagingApi.deleteMentorDocument(deleteDocumentId);
      toast.success('Document deleted');
      setDocuments(documents.filter((d) => d.id !== deleteDocumentId));
    } catch (err) {
      toast.error('Failed to delete document');
    } finally {
      setDeleting(false);
      setDeleteDocumentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-slate-900 mb-2">Knowledge Base</h2>
        <p className="text-slate-600">
          Upload PDF documents to train your AI on your specific context. The AI will use these to draft better responses for your mentees.
        </p>
      </div>

      {/* AI Auto-Reply Toggle Card */}
      <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3.5">
            <div className={`p-2.5 rounded-xl shrink-0 ${autoReplyEnabled ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'
              }`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-sm sm:text-base text-slate-900">
                  AI Automatic Replies
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${autoReplyEnabled
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${autoReplyEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {autoReplyEnabled ? 'On' : 'Off'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {autoReplyEnabled 
                  ? 'AI will analyze incoming mentee messages against your uploaded documents to automatically send responses or generate drafts for your review.' 
                  : 'AI auto-replies and draft generation are turned off. Mentee messages will not trigger automated responses.'}
              </p>
            </div>
          </div>

          {/* Standard Toggle Switch */}
          <button
            type="button"
            onClick={handleToggleAutoReply}
            disabled={toggling}
            aria-label="Toggle AI Automatic Replies"
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 ${autoReplyEnabled ? 'bg-brand-600' : 'bg-slate-200'
              }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center ${autoReplyEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
            >
              {toggling && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </span>
          </button>
        </div>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="application/pdf"
          onChange={handleFileSelect}
        />
        {uploading ? (
          <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-4" />
        ) : (
          <UploadCloud className="w-10 h-10 text-slate-400 mb-4" />
        )}
        <h3 className="text-slate-900 font-medium mb-1">
          {uploading ? 'Uploading...' : 'Click or drag to upload'}
        </h3>
        <p className="text-slate-500 text-sm">
          Supports PDF only (Max 10MB)
        </p>
      </div>

      {/* Documents List */}
      <div>
        <h3 className="font-medium text-slate-900 mb-4">Your Documents</h3>
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-100 text-slate-500">
            No documents uploaded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-white border border-slate-200 rounded-xl min-w-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 sm:p-3 bg-brand-50 rounded-lg shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-slate-900 font-medium text-sm truncate" title={doc.fileName}>
                      {doc.fileName}
                    </h4>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Uploaded on {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  {doc.status === 'processing' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing
                    </span>
                  )}
                  {doc.status === 'completed' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ready
                    </span>
                  )}
                  {doc.status === 'failed' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium" title={doc.errorMessage}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      Failed
                    </span>
                  )}

                  <button
                    onClick={() => setDeleteDocumentId(doc.id)}
                    className="p-1.5 sm:p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RAG PDF Best Practices & Formatting Guide */}
      <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-medium">
          <Lightbulb className="w-5 h-5 text-brand-600 shrink-0" />
          <h4 className="text-sm sm:text-base">PDF Optimization Guide for AI Auto-Replies</h4>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          The AI reads your uploaded PDFs to automatically answer mentee questions with high accuracy. Follow these practical tips when creating your PDFs:
        </p>
        <div className="grid sm:grid-cols-2 gap-3 text-xs sm:text-sm pt-1">
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <BookOpenCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              Clear Headings & Sections
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Use distinct section titles (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">Proposal Guidelines</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">Office Hours Policy</code>) so the AI retrieves exact relevant paragraphs.
            </p>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-brand-600 shrink-0" />
              Direct Q&A / FAQ Format
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Include explicit Q&A blocks (e.g. <em className="text-slate-700">"Q: How long should proposals be? A: Keep proposals between 3-5 pages focusing on architecture."</em>).
            </p>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600 shrink-0" />
              Digital Selectable Text (No Scans)
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Export PDFs directly from Word, Google Docs, or Notion. Scanned photos or flattened images cannot be converted into searchable text chunks.
            </p>
          </div>
          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-indigo-600 shrink-0" />
              Explicit Rules & Specific Details
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Provide exact numbers, submission links, deadlines, and requirements so the AI can provide definitive answers without guessing.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteDocumentId}
        title="Delete Document"
        description="Are you sure you want to delete this document? The AI will no longer use it as context for drafting responses."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => !deleting && setDeleteDocumentId(null)}
      />
    </div>
  );
}
