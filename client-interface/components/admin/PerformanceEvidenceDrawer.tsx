"use client";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquareText,
  Paperclip,
} from "lucide-react";
import { Drawer } from "@/components/shared/Drawer";
import { RichTextReader } from "@/components/shared/RichTextReader";
import { apiClient } from "@/lib/services/api-client";

interface Evidence {
  total: number;
  page: number;
  pages: number;
  tasks: {
    id: string;
    title: string;
    type: string;
    completedAt: string;
    points: number;
    isLate: boolean;
    submission: null | {
      text: string;
      urls: string[];
      submittedAt: string;
      files: { id: string; fileName: string; fileUrl: string }[];
      feedback: {
        id: string;
        feedbackText: string;
        rating: string;
        isApproved: boolean;
      }[];
    };
  }[];
}
const webUrl = (value: string) =>
  /^https?:\/\//i.test(value) ? value : undefined;

function EvidenceTask({ task }: { task: Evidence["tasks"][number] }) {
  const submission = task.submission;
  const links = submission?.urls?.filter((url) => webUrl(url)) ?? [];
  const files = submission?.files?.filter((file) => webUrl(file.fileUrl)) ?? [];
  const feedback = submission?.feedback ?? [];

  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/40">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{task.title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {task.type} · {task.completedAt
              ? new Date(task.completedAt).toLocaleDateString()
              : "Completion date unavailable"}
            {task.isLate ? " · Submitted late" : " · On time"}
          </span>
        </span>
        <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">
          {submission ? "Submission" : "No submission"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-4 py-4">
        {!submission ? (
          <p className="text-sm text-muted-foreground">Marked complete; no submission was recorded.</p>
        ) : (
          <div className="space-y-3">
            {submission.text && (
              <details open className="rounded-lg border border-border bg-muted/20">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Submission</summary>
                <div className="border-t border-border px-3 py-3">
                  <RichTextReader content={submission.text} className="evidence-rich text-sm" />
                </div>
              </details>
            )}
            {(links.length > 0 || files.length > 0) && (
              <details className="rounded-lg border border-border">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  Links & files ({links.length + files.length})
                </summary>
                <div className="space-y-2 border-t border-border px-3 py-3">
                  {links.map((url, index) => (
                    <a key={`${url}-${index}`} href={webUrl(url)} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 break-all text-sm text-brand-700 hover:underline">
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />{url}
                    </a>
                  ))}
                  {files.map((file) => (
                    <a key={file.id} href={webUrl(file.fileUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand-700 hover:underline">
                      <FileText className="h-4 w-4 shrink-0" />{file.fileName}
                    </a>
                  ))}
                </div>
              </details>
            )}
            {feedback.length > 0 && (
              <details className="rounded-lg border border-border">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
                  <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                  Mentor feedback ({feedback.length})
                </summary>
                <div className="space-y-3 border-t border-border px-3 py-3">
                  {feedback.map((item) => (
                    <div key={item.id} className="border-l-2 border-brand-300 pl-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">{item.rating}/5 · {item.isApproved ? "Approved" : "Changes requested"}</p>
                      <RichTextReader content={item.feedbackText} className="evidence-rich text-sm" />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
export function PerformanceEvidenceDrawer({
  nominationId,
  name,
  onClose,
}: {
  nominationId: string;
  name: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Evidence | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiClient
      .get<{ data: Evidence }>(`/top-performers/${nominationId}/evidence`, {
        params: { page },
      })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load completed work.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nominationId, page, retry]);
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${name} · work evidence`}
      subtitle="Completed work in the nominated program, with submissions and mentor feedback."
      width="lg"
    >
      {loading ? (
        <div role="status" className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="sr-only">Loading evidence</span>
        </div>
      ) : error ? (
        <div role="alert">
          {error}
          <button
            onClick={() => setRetry((value) => value + 1)}
            className="ml-3 text-brand-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {data?.total.toLocaleString()} completed tasks · latest first
          </p>
          {!data?.tasks.length && (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p>No completed work is recorded for this program yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                The nomination alone is not proof of completed work.
              </p>
            </div>
          )}
          {data?.tasks.map((task) => <EvidenceTask key={task.id} task={task} />)}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs">
                Page {page} of {data.pages}
              </span>
              <button
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
