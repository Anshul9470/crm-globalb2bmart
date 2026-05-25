import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TeamManagementViewProps {
  userId: string;
}

const TeamManagementView = ({ userId }: TeamManagementViewProps) => {
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [loading, setLoading] = useState(true);
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    fetchTeam();
    fetchAvailableEmployees();
  }, [userId]);

  const fetchTeam = async () => {
    setLoading(true);
    
    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("*")
      .eq("team_lead_id", userId)
      .single();

    if (teamData) {
      setTeam(teamData);
      
      const { data: membersData, error: membersError } = await supabase
        .from("team_members")
        .select("*, employee:profiles!employee_id(*)")
        .eq("team_id", teamData.id);

      if (membersData) {
        setMembers(membersData);
      }
    }
    
    setLoading(false);
  };

  const fetchAvailableEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          user_roles!inner(role)
        `)
        .eq("user_roles.role", "employee");

      if (error) throw error;

      if (data) {
        setAvailableEmployees(data);
      }
    } catch (error: any) {
      console.error("Error fetching available employees:", error);
    }
  };

  const handleAddMember = async () => {
    if (!selectedEmployee || !team) {
      toast.error("Please select an employee to add");
      return;
    }

    // Check if employee is already in the team
    const isAlreadyMember = members.some(member => member.employee_id === selectedEmployee);
    if (isAlreadyMember) {
      toast.error("This employee is already in your team");
      return;
    }

    setAddingMember(true);
    try {
      const { error } = await supabase
        .from("team_members")
        .insert([
          {
            team_id: team.id,
            employee_id: selectedEmployee,
          },
        ]);

      if (error) throw error;

      toast.success("Member added to team successfully");
      setSelectedEmployee("");
      fetchTeam(); // Refresh team data
    } catch (error: any) {
      toast.error(error.message || "Failed to add member to team");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast.success("Member removed from team");
      fetchTeam();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove member");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">No Team Assigned</h2>
        <p className="text-muted-foreground">
          Contact your administrator to create a team for you.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Team Management</h2>
      
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Add Team Member Card */}
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
                    .filter(emp => !members.some(member => member.employee_id === emp.id))
                    .map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.display_name} ({emp.email})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              onClick={handleAddMember} 
              className="w-full" 
              disabled={addingMember || !selectedEmployee}
            >
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

        {/* Team Members Card */}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <UserMinus className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeamManagementView;
