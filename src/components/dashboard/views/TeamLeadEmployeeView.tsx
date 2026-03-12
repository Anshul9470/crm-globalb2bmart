import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface TeamLeadEmployeeViewProps {
  teamLeadId: string;
  onLoginAsUser: (userId: string, userName: string) => void;
}

const TeamLeadEmployeeView = ({ teamLeadId, onLoginAsUser }: TeamLeadEmployeeViewProps) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchEmployees();
  }, [teamLeadId]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      // First, get the team for this team lead
      const { data: teamRows, error: teamError } = await supabase
        .from("teams")
        .select("id")
        .eq("team_lead_id", teamLeadId)
        .limit(1);
      const teamData = teamRows?.[0] || null;

      if (teamError || !teamData) {
        setEmployees([]);
        setLoading(false);
        return;
      }

      // Get team members assigned to this team
      const { data: teamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("employee_id")
        .eq("team_id", teamData.id);

      if (membersError) throw membersError;

      const employeeIds = teamMembers?.map((tm: any) => tm.employee_id) || [];

      if (employeeIds.length === 0) {
        setEmployees([]);
        setLoading(false);
        return;
      }

      // Get employee profiles
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          user_roles (role)
        `)
        .in("id", employeeIds)
        .order("display_name", { ascending: true });

      if (error) throw error;

      if (data) {
        // Filter to only show employees (not team leads or admins)
        const empList = data.filter((user) => {
          const roles = user.user_roles?.map((r: any) => r.role) || [];
          return roles.includes("employee") && !roles.includes("admin") && !roles.includes("team_lead");
        });

        setEmployees(empList);
      }
    } catch (error: any) {
      console.error("Error fetching employees:", error);
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAsUser = (userId: string, userName: string) => {
    onLoginAsUser(userId, userName);
    toast.success(`Now viewing as ${userName}`);
  };

  const filteredEmployees = employees.filter((user) => {
    const matchesSearch =
      user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2 text-white">View Employees</h2>
        <p className="text-white/80">
          View and access employee dashboards instantly
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md placeholder:text-white/80"
        />
      </div>

      {/* Employees Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Employees
            </CardTitle>
            <Badge variant="secondary">{filteredEmployees.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEmployees.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchQuery ? "No employees found matching your search." : "No employees found in your team."}
            </p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredEmployees.map((user) => (
                <div
                  key={user.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-4 w-4 text-primary flex-shrink-0" />
                        <p className="font-semibold truncate">{user.display_name || "Unknown"}</p>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          Employee
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleLoginAsUser(user.id, user.display_name || user.email)}
                      className="flex-shrink-0"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Login As User
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamLeadEmployeeView;

