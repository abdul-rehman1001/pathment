"use client";
import { useEffect, useState } from "react";
import { Loader2, ExternalLink, FileText } from "lucide-react";
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
          {data?.tasks.map((task) => (
            <article key={task.id} className="rounded-2xl border bg-card p-5">
              <h3 className="font-semibold">{task.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {task.type} ·{" "}
                {task.completedAt
                  ? new Date(task.completedAt).toLocaleDateString()
                  : "Completion date unavailable"}{" "}
                · {task.isLate ? "Submitted late" : "On time"}
              </p>
              {task.submission ? (
                <div className="mt-4 space-y-3">
                  {task.submission.text && (
                    <RichTextReader content={task.submission.text} />
                  )}
                  <div className="space-y-2">
                    {task.submission.urls
                      ?.filter((url) => webUrl(url))
                      .map((url, index) => (
                        <a
                          key={`${url}-${index}`}
                          href={webUrl(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 break-all text-sm text-brand-700 hover:underline"
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          {url}
                        </a>
                      ))}
                    {task.submission.files
                      ?.filter((file) => webUrl(file.fileUrl))
                      .map((file) => (
                        <a
                          key={file.id}
                          href={webUrl(file.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-brand-700 hover:underline"
                        >
                          <FileText className="h-4 w-4" />
                          {file.fileName}
                        </a>
                      ))}
                  </div>
                  {task.submission.feedback?.map((feedback) => (
                    <div key={feedback.id} className="rounded-xl bg-muted p-3">
                      <p className="mb-2 text-xs font-semibold">
                        Mentor feedback · {feedback.rating}/5 ·{" "}
                        {feedback.isApproved ? "Approved" : "Changes requested"}
                      </p>
                      <RichTextReader content={feedback.feedbackText} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Marked complete; no submission was recorded.
                </p>
              )}
            </article>
          ))}
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
