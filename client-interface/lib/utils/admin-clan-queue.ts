import type { ClanHealthCard } from "@/lib/hooks/admin/useClanHealth";

export type Queue = "attention" | "reviews" | "blockers" | "all";
export const CLAN_PAGE_SIZE = 6;
type ClanRow = ClanHealthCard & { programId: string; programName: string };
const STATUS_ORDER = { red: 0, amber: 1, green: 2 };

export function filterClanQueue(
  clans: ClanRow[],
  filters: { programId: string; query: string; queue: Queue },
) {
  const query = filters.query.trim().toLowerCase();
  return clans
    .filter(
      (clan) =>
        (!filters.programId || clan.programId === filters.programId) &&
        (!query ||
          [clan.name, clan.programName, clan.leadMentor?.name]
            .join(" ")
            .toLowerCase()
            .includes(query)) &&
        (filters.queue === "all" ||
          (filters.queue === "attention" && clan.status !== "green") ||
          (filters.queue === "reviews" && clan.pendingApprovals > 0) ||
          (filters.queue === "blockers" && clan.openBlockers > 0)),
    )
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        b.atRisk - a.atRisk ||
        b.pendingApprovals - a.pendingApprovals ||
        a.name.localeCompare(b.name),
    );
}
