import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

interface TeamLeadInfo {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface MemberInfo {
  id: string;
  employee_id: string;
  employee: {
    display_name: string | null;
    email: string | null;
  };
}

const AdminTeamManagementView = () => {
  const [teamLeads, setTeamLeads] = useState<TeamLeadInfo[]>([]);
  const [selectedTeamLead, setSelectedTeamLead] = useState<string>("");
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    fetchTeamLeads();
    fetchAvailableEmployees();
  }, []);

  useEffect(() => {
    if (selectedTeamLead) {
      fetchTeam(selectedTeamLead);
    } else {
      setTeam(null);
      setMembers([]);
    }
  }, [selectedTeamLead]);

  const fetchTeamLeads = async () => {
    setLoading(true);
    try {
      // Step 1: Get all users who have team lead roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["team_lead"]);

      if (rolesError) throw rolesError;

      if (!rolesData || rolesData.length === 0) {
        setTeamLeads([]);
        return;
      }

      const userIds = rolesData.map(r => r.user_id);

      // Step 2: Fetch profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const mappedLeads = (profilesData || []).map(profile => ({
        id: profile.id,
        display_name: profile.display_name,
        email: profile.email
      })) as TeamLeadInfo[];

      setTeamLeads(mappedLeads);
    } catch (err: any) {
      const errorMessage = err.message || "Failed to load team leads";
      toast.error(errorMessage);
      console.error("❌ Detailed error in fetchTeamLeads:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableEmployees = async () => {
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "employee");

      if (rolesError) throw rolesError;
      if (!rolesData || rolesData.length === 0) {
        setAvailableEmployees([]);
        return;
      }

      const userIds = rolesData.map(r => r.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const mappedEmployees = (profilesData || []).map(profile => ({
        id: profile.id,
        display_name: profile.display_name,
        email: profile.email
      }));

      setAvailableEmployees(mappedEmployees);
    } catch (err: any) {
      console.error("❌ Error fetching available employees:", err);
    }
  };

  const fetchTeam = async (teamLeadId: string) => {
    setLoading(true);
    setMembers([]);
    setTeam(null);

    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("*")
      .eq("team_lead_id", teamLeadId)
      .maybeSingle(); // avoid 406 when no team exists yet

    if (teamError) {
      console.error("Error fetching team:", teamError);
      setLoading(false);
      return;
    }

    if (!teamData) {
      // No team created yet for this lead
      setTeam(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    setTeam(teamData);

    const { data: membersData } = await supabase
      .from("team_members")
      .select("*, employee:profiles!employee_id(*)")
      .eq("team_id", teamData.id);

    setMembers((membersData as MemberInfo[]) || []);
    setLoading(false);
  };

  const handleAddMember = async () => {
    if (!selectedTeamLead || !team) {
      toast.error("Select a team lead with a team first");
      return;
    }

    if (!selectedEmployee) {
      toast.error("Please select an employee to add");
      return;
    }

    const isAlreadyMember = members.some((member) => member.employee_id === selectedEmployee);
    if (isAlreadyMember) {
      toast.error("This employee is already in the team");
      return;
    }

    setAddingMember(true);
    try {
      const { error } = await supabase.from("team_members").insert([
        {
          team_id: team.id,
          employee_id: selectedEmployee,
        },
      ]);

      if (error) throw error;

      toast.success("Member added to team successfully");
      setSelectedEmployee("");
      fetchTeam(selectedTeamLead);
    } catch (err: any) {
      toast.error(err.message || "Failed to add member to team");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await supabase.from("team_members").delete().eq("id", memberId);
      if (error) throw error;

      toast.success("Member removed from team");
      if (selectedTeamLead) {
        fetchTeam(selectedTeamLead);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    }
  };

  if (loading && !selectedTeamLead) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-white">Team Management</h2>
        <p className="text-white/80">
          Select a team lead to view and manage their team members.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Team Lead</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedTeamLead} onValueChange={setSelectedTeamLead}>
            <SelectTrigger className=" border-white/20 text-white">
              <SelectValue placeholder="Choose a team lead" />
            </SelectTrigger>
            <SelectContent>
              {teamLeads.map((lead) => (
                <SelectItem key={lead.id} value={lead.id}>
                  {lead.display_name || "Unnamed"} ({lead.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedTeamLead ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Choose a team lead to manage their team.
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !team ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-semibold mb-2">No team found for this team lead.</p>
            <p className="text-sm text-muted-foreground">
              Create a team for this team lead in Team Creation first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add Team Member
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Employee</label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an employee to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEmployees
                      .filter((emp) => !members.some((member) => member.employee_id === emp.id))
                      .map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.display_name} ({emp.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleAddMember} className="w-full" disabled={addingMember || !selectedEmployee}>
                {addingMember ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add to Team
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.length === 0 ? (
                  <p className="text-muted-foreground">No team members yet.</p>
                ) : (
                  members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between border rounded-lg p-4">
                      <div>
                        <p className="font-medium">{member.employee.display_name}</p>
                        <p className="text-sm text-muted-foreground">{member.employee.email}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(member.id)}>
                        <UserMinus className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminTeamManagementView;

