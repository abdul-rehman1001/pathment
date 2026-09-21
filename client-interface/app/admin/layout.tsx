import "@/styles/mentor-appearance.css";
import "@/styles/admin-appearance.css";
import { AdminWorkspaceTabs } from "@/components/admin/AdminWorkspaceTabs";
import { Navigation } from "@/components/shared/Navigation";
import { RoleGuard } from "@/components/shared/RoleGuard";
import { AdminAccessGate } from "@/components/shared/AdminAccessGate";
import { ActivityTrackerMount } from "@/components/shared/ActivityTrackerMount";
import { TimezoneSync } from "@/components/shared/TimezoneSync";
import { WalkthroughMount } from "@/components/onboarding/WalkthroughMount";
import { ChangelogMount } from "@/components/shared/ChangelogMount";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={["admin"]} permitAdminArea>
      <div data-admin-appearance className="min-h-screen bg-canvas">
        {" "}
        <ActivityTrackerMount />
        <TimezoneSync />
        <WalkthroughMount role="admin" />
        <ChangelogMount role="admin" /> <Navigation role="admin" />
        <main className="lg:pl-64 pt-14 lg:pt-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <AdminAccessGate>
              <AdminWorkspaceTabs />
              {children}
            </AdminAccessGate>
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
