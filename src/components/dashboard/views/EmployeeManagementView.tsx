import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const EmployeeManagementView = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select(`
        *,
        user_roles (role)
      `);

    if (!error && data) {
      setEmployees(data);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) {
      toast.error("Please select both user and role");
      return;
    }

    setLoading(true);
    try {
      // Map UI roles to DB enum roles (seo/web is stored as employee)
      const dbRole =
        selectedRole === "seo_website_employee" ? "employee" : selectedRole;

      const { error } = await supabase
        .from("user_roles")
        .upsert([
          {
            user_id: selectedUser,
            // Cast to any to allow new role values not yet in generated types (e.g., paid_team_lead)
            role: dbRole as any,
          },
        ], { onConflict: "user_id,role" });

      if (error) throw error;

      toast.success("Role assigned successfully!");
      setSelectedUser("");
      setSelectedRole("");
      fetchEmployees();
    } catch (error: any) {
      toast.error(error.message || "Failed to assign role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-white">Employee Management</h2>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assign Role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-white">
              <label className="text-sm font-medium text-black">Select Employee</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.display_name} ({emp.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 text-white">
              <label className="text-sm font-medium text-black">Select Role</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="team_lead">Team Lead</SelectItem>
                  <SelectItem value="paid_team_lead">Paid Team Lead</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="seo_website_employee">
                    SEO / Website (Employee)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleAssignRole} className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign Role"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {employees.map((emp) => (
                <div key={emp.id} className="border rounded-lg p-3">
                  <p className="font-medium">{emp.display_name}</p>
                  <p className="text-sm text-muted-foreground">{emp.email}</p>
                  <div className="flex gap-2 mt-2">
                    {emp.user_roles?.map((role: any, index: number) => (
                      <Badge key={index} variant="secondary">
                        {role.role}
                      </Badge>
                    ))}
                    {(!emp.user_roles || emp.user_roles.length === 0) && (
                      <Badge variant="outline">No role</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeManagementView;
