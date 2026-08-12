'use client';

import { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
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

export function DocumentsTab() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              <div key={doc.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-brand-50 rounded-lg">
                    <FileText className="w-6 h-6 text-brand-600" />
                  </div>
                  <div>
                    <h4 className="text-slate-900 font-medium text-sm">{doc.fileName}</h4>
                    <p className="text-slate-500 text-xs mt-1">
                      Uploaded on {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {doc.status === 'processing' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing
                    </span>
                  )}
                  {doc.status === 'completed' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ready
                    </span>
                  )}
                  {doc.status === 'failed' && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium" title={doc.errorMessage}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      Failed
                    </span>
                  )}

                  <button
                    onClick={() => setDeleteDocumentId(doc.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
