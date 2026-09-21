"use client";

import { useQuery } from "@tanstack/react-query";
import taskApi from "@/lib/services/task-api";
import { RichContent } from "@/components/shared/RichContent";
import { ResourceLink } from "@/components/shared/ResourceLink";
import { SubmissionFileList } from "@/components/shared/SubmissionFileList";
import type { SubmissionFile } from "@/lib/types/submission";

type Feedback = {
  id: string;
  rating?: number | string | null;
  feedbackText?: string | null;
};
type Submission = {
  id: string;
  version: number;
  submittedAt?: string;
  submissionText?: string;
  submissionUrls?: string[];
  files?: SubmissionFile[];
  feedback?: Feedback[] | Feedback | null;
};

/** Fetch full submissions on demand; list rows intentionally omit attachments and reviews. */
export function TaskSubmissionHistory({ taskId }: { taskId: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["assigned-task-detail", taskId],
    queryFn: async () =>
      (await taskApi.getTaskById(taskId)).data.task as {
        submissions?: Submission[];
      },
  });
  const submissions = data?.submissions || [];
  return (
    <section aria-label="Submissions and feedback" className="space-y-4">
      <h3 className="text-base font-semibold">Submitted work</h3>
      {isPending ? (
        <p role="status">Loading submissions…</p>
      ) : isError ? (
        <div role="alert">
          <p>Could not load submissions.</p>
          <button
            onClick={() => refetch()}
            className="text-brand-600 underline"
          >
            Try again
          </button>
        </div>
      ) : !submissions.length ? (
        <p className="text-sm text-muted-foreground">
          No submission was recorded for this task.
        </p>
      ) : (
        submissions.map((submission) => (
          <article
            key={submission.id}
            className="rounded-xl border border-border p-4 space-y-3"
          >
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium">
                Submission {submission.version || 1}
              </span>
              <span className="text-muted-foreground">
                {submission.submittedAt
                  ? new Date(submission.submittedAt).toLocaleDateString()
                  : ""}
              </span>
            </div>
            <RichContent
              html={submission.submissionText}
              emptyText="No written submission."
            />
            {submission.submissionUrls?.map((url, index) => (
              <ResourceLink key={`${url}-${index}`} url={url} title={url} />
            ))}
            {!!submission.files?.length && (
              <SubmissionFileList files={submission.files} />
            )}
            {(Array.isArray(submission.feedback)
              ? submission.feedback
              : submission.feedback
                ? [submission.feedback]
                : []
            ).map((feedback) => (
              <div
                key={feedback.id}
                className="rounded-lg bg-muted p-3 space-y-2"
              >
                <p className="text-sm font-semibold">
                  Mentor feedback
                  {feedback.rating != null ? ` · ${feedback.rating}/5` : ""}
                </p>
                <RichContent
                  html={feedback.feedbackText}
                  emptyText="No written feedback."
                />
              </div>
            ))}
          </article>
        ))
      )}
    </section>
  );
}
