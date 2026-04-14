import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DollarSign, Globe, Smile, Frown, Meh, MessageCircle } from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import PaidClientPoolView from "./views/PaidClientPoolView";
import { supabase } from "@/integrations/supabase/client";

interface PaidLeadDashboardProps {
  user: User;
}

const PaidLeadDashboard = ({ user }: PaidLeadDashboardProps) => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState("paid-clients");
  const [focusRequest, setFocusRequest] = useState<{
    companyId: string;
    openComments?: boolean;
    token: number;
  } | null>(null);

  useEffect(() => {
    // Allows PaidClientPoolView notification clicks to navigate the sidebar and highlight the target card.
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        view: "paid-clients" | "web-seo" | "satisfied" | "dissatisfied" | "average" | "no-response";
        companyId: string;
        openComments?: boolean;
      }>;

      if (!custom.detail?.view || !custom.detail?.companyId) return;
      setCurrentView(custom.detail.view);
      setFocusRequest({
        companyId: custom.detail.companyId,
        openComments: custom.detail.openComments,
        token: Date.now(),
      });
    };

    window.addEventListener("paidlead:navigate_to_company", handler);
    return () => window.removeEventListener("paidlead:navigate_to_company", handler);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const menuItems = [
    { id: "paid-clients", label: "Paid Clients", icon: DollarSign },
    { id: "web-seo", label: "Web/SEO", icon: Globe },
    { id: "satisfied", label: "Satisfied", icon: Smile },
    { id: "dissatisfied", label: "Dissatisfied", icon: Frown },
    { id: "average", label: "Average", icon: Meh },
    { id: "no-response", label: "No Response", icon: MessageCircle },
  ];

  return (
    <DashboardLayout
      menuItems={menuItems}
      currentView={currentView}
      onViewChange={setCurrentView}
      user={user}
      userName={user.email?.split("@")[0] || "Team Lead"}
      onLogout={handleLogout}
    >
      {currentView === "paid-clients" && (
        <PaidClientPoolView
          userRole="paid_team_lead"
          defaultTab="all"
          focusCompanyId={focusRequest?.companyId}
          focusOpenComments={focusRequest?.openComments}
          focusToken={focusRequest?.token}
        />
      )}
      {currentView === "web-seo" && (
        <PaidClientPoolView
          userRole="paid_team_lead"
          defaultTab="completed"
          focusCompanyId={focusRequest?.companyId}
          focusOpenComments={focusRequest?.openComments}
          focusToken={focusRequest?.token}
        />
      )}
      {currentView === "satisfied" && (
        <PaidClientPoolView
          userRole="paid_team_lead"
          defaultTab="satisfied"
          focusCompanyId={focusRequest?.companyId}
          focusOpenComments={focusRequest?.openComments}
          focusToken={focusRequest?.token}
        />
      )}
      {currentView === "dissatisfied" && (
        <PaidClientPoolView
          userRole="paid_team_lead"
          defaultTab="dissatisfied"
          focusCompanyId={focusRequest?.companyId}
          focusOpenComments={focusRequest?.openComments}
          focusToken={focusRequest?.token}
        />
      )}
      {currentView === "average" && (
        <PaidClientPoolView
          userRole="paid_team_lead"
          defaultTab="average"
          focusCompanyId={focusRequest?.companyId}
          focusOpenComments={focusRequest?.openComments}
          focusToken={focusRequest?.token}
        />
      )}
      {currentView === "no-response" && (
        <PaidClientPoolView
          userRole="paid_team_lead"
          defaultTab="no-response"
          focusCompanyId={focusRequest?.companyId}
          focusOpenComments={focusRequest?.openComments}
          focusToken={focusRequest?.token}
        />
      )}
    </DashboardLayout>
  );
};

export default PaidLeadDashboard;

