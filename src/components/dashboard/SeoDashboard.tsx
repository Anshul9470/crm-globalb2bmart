import { User } from "@supabase/supabase-js";
import { useState } from "react";
import DashboardLayout from "./DashboardLayout";
import { LogOut, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import SeoTasksView from "./views/SeoTasksView";

interface SeoDashboardProps {
  user: User;
}

const SeoDashboard = ({ user }: SeoDashboardProps) => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState("seo-tasks");

  const handleLogout = async () => {
    // Reset login approval status to pending on logout for security
    try {
      await (supabase
        .from("login_approvals" as any)
        .update({ status: "pending", requested_at: new Date().toISOString() })
        .eq("user_id", user.id) as any);
    } catch (e) {
      console.error("Logout approval sync failed:", e);
    }

    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const menuItems = [
    { id: "seo-tasks", label: "SEO / Website Tasks", icon: Search },
  ];

  return (
    <DashboardLayout
      menuItems={menuItems}
      currentView={currentView}
      onViewChange={setCurrentView}
      user={user}
      userName={user.email?.split("@")[0] || "SEO / Website"}
      onLogout={handleLogout}
    >
      {currentView === "seo-tasks" && <SeoTasksView userId={user.id} />}
    </DashboardLayout>
  );
};

export default SeoDashboard;


