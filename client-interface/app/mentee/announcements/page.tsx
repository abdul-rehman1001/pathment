"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { useAnnouncements } from "@/lib/hooks/shared/useAnnouncements";
import { AnnouncementFeed } from "@/components/shared/AnnouncementFeed";

export default function MenteeAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  const [query, setQuery] = useState("");
  const visible = announcements.filter((item) =>
    `${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="mentee-page-heading">
        <h1 className="text-slate-900 mb-2 flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-600" /> Announcements
        </h1>
        <p className="text-slate-600">
          Updates from your mentor, your program, and the team.
        </p>
      </div>
      <input
        aria-label="Search announcements"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search announcements…"
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm"
      />
      <AnnouncementFeed
        announcements={visible}
        loading={loading}
        error={error}
        onRefresh={refetch}
        emptyHint="No announcements yet - your mentor and admins will post here."
      />
    </div>
  );
}
