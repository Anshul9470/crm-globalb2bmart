import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Users, LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface UserImpersonationViewProps {
  onLoginAsUser: (userId: string, userRole: "employee" | "team_lead", userName: string) => void;
}

const UserImpersonationView = ({ onLoginAsUser }: UserImpersonationViewProps) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "employee" | "team_lead">("all");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          user_roles (role)
        `)
        .order("display_name", { ascending: true });

      if (error) throw error;

      if (data) {
        // Separate employees and team leads
        const empList: any[] = [];
        const tlList: any[] = [];

        data.forEach((user) => {
          const roles = user.user_roles?.map((r: any) => r.role) || [];
          
          if (roles.includes("employee") && !roles.includes("admin")) {
            empList.push(user);
          }
          if (roles.includes("team_lead") && !roles.includes("admin")) {
            tlList.push(user);
          }
        });

        setEmployees(empList);
        setTeamLeads(tlList);
      }
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAsUser = (userId: string, role: "employee" | "team_lead", userName: string) => {
    onLoginAsUser(userId, role, userName);
    toast.success(`Now viewing as ${userName}`);
  };

  const filterUsers = (users: any[]) => {
    return users.filter((user) => {
      const matchesSearch =
        user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  };

  const filteredEmployees = filterUsers(employees);
  const filteredTeamLeads = filterUsers(teamLeads);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2 text-white">User Impersonation</h2>
        <p className="text-white/80">
          View and access employee or team leader dashboards instantly
        </p>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1 ">
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md placeholder:text-white/60"
          />
        </div>
        <div className="flex gap-2 text-white">
          <Button
            variant={filterRole === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterRole("all")}
          >
            All Users
          </Button>
          <Button
            variant={filterRole === "employee" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterRole("employee")}
          >
            Employees
          </Button>
          <Button
            variant={filterRole === "team_lead" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterRole("team_lead")}
          >
            Team Leaders
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Leaders Section */}
        {(filterRole === "all" || filterRole === "team_lead") && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Team Leaders
                </CardTitle>
                <Badge variant="secondary">{filteredTeamLeads.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {filteredTeamLeads.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {searchQuery ? "No team leaders found matching your search." : "No team leaders found."}
                </p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {filteredTeamLeads.map((user) => (
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
                            <Badge variant="secondary" className="text-xs">
                              Team Lead
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleLoginAsUser(user.id, "team_lead", user.display_name || user.email)}
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
        )}

        {/* Employees Section */}
        {(filterRole === "all" || filterRole === "employee") && (
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
                  {searchQuery ? "No employees found matching your search." : "No employees found."}
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
                          onClick={() => handleLoginAsUser(user.id, "employee", user.display_name || user.email)}
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
        )}
      </div>
    </div>
  );
};

export default UserImpersonationView;

