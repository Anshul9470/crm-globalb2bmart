import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const TeamCreationView = () => {
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [teamName, setTeamName] = useState("");
  const [selectedTL, setSelectedTL] = useState("");
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);

  useEffect(() => {
    fetchTeamLeads();
    fetchTeams();
  }, []);

  const fetchTeamLeads = async () => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          role,
          profiles:user_id (
            id,
            display_name,
            email
          )
        `)
        .in("role", ["team_lead", "paid_team_lead"] as any);

      if (!error && data) {
        // Map to the format the view expects
        const mappedLeads = data
          .filter(item => item.profiles)
          .map(item => ({
            user_id: (item.profiles as any).id,
            profiles: {
              display_name: (item.profiles as any).display_name,
              email: (item.profiles as any).email
            }
          }));
        setTeamLeads(mappedLeads);
      }
    } catch (err) {
      console.error("Error fetching team leads:", err);
    }
  };

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from("teams")
      .select("*, team_lead:profiles!team_lead_id(display_name)");

    if (!error && data) {
      setTeams(data);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("teams").insert([
        {
          name: teamName,
          team_lead_id: selectedTL,
        },
      ]);

      if (error) throw error;

      toast.success("Team created successfully!");
      setTeamName("");
      setSelectedTL("");
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message || "Failed to create team");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto text-white ">
      <h2 className="text-3xl font-bold mb-6">Team Creation</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create New Team</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team_name">Team Name</Label>
                <Input
                  id="team_name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 text-white">
                <Label className="text-black">Team Lead</Label>
                <Select value={selectedTL} onValueChange={setSelectedTL}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamLeads.map((tl) => (
                      <SelectItem key={tl.user_id} value={tl.user_id}>
                        {tl.profiles.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Team"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {teams.length === 0 ? (
                <p className="text-muted-foreground text-sm">No teams created yet.</p>
              ) : (
                teams.map((team) => (
                  <div key={team.id} className="border rounded-lg p-3">
                    <p className="font-medium">{team.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Lead: {team.team_lead.display_name}
                    </p>
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

export default TeamCreationView;
