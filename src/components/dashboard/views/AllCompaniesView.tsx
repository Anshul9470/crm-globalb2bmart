import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CompanyCard from "@/components/CompanyCard";
import { Loader2, CheckSquare, Square, X, UserCheck } from "lucide-react";
import { toast } from "sonner";
import FacebookDataCard from "./FacebookDataCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AllCompaniesViewProps {
  userRole?: string;
}

const MAX_SELECT = 5;

const AllCompaniesView = ({ userRole }: AllCompaniesViewProps) => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Bulk-select state
  const [selectedItems, setSelectedItems] = useState<{ id: string | number; isFacebook: boolean }[]>([]);
  const [selectMode, setSelectMode] = useState(false);

  // Employees/TL list for assignment
  const [employees, setEmployees] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchAllCompanies();
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    const { data: rolesData } = await supabase
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
      .in("role", ["employee", "team_lead", "paid_team_lead"] as any);

    if (rolesData) {
      const mapped = rolesData
        .filter((item: any) => item.profiles)
        .map((item: any) => ({
          ...(item.profiles as any),
          role: item.role,
        }));
      setEmployees(mapped);
    }
  };

  const fetchAllCompanies = async () => {
    setLoading(true);
    try {
      const { data: companiesData, error: companiesError } = await (supabase
        .from("companies" as any)
        .select("*")
        .eq("approval_status", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }) as any);

      if (companiesError) throw companiesError;

      const { data: fbData, error: fbError } = await (supabase
        .from("facebook_data" as any)
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }) as any);

      if (fbError) {
        console.warn("Facebook data fetch failed:", fbError);
      }

      const rawCombinedData = [
        ...(companiesData || []),
        ...(fbData || []).map((fb: any) => ({
          ...fb,
          is_facebook_data: true,
        })),
      ];

      // Deduplicate by phone number, keeping facebook_data over companies
      const deduplicatedMap = new Map();
      rawCombinedData.forEach((item) => {
        // Only deduplicate if phone exists
        if (item.phone) {
          const existing = deduplicatedMap.get(item.phone);
          if (existing) {
            // Keep the one that IS facebook data
            if (!existing.is_facebook_data && item.is_facebook_data) {
              deduplicatedMap.set(item.phone, item);
            }
          } else {
            deduplicatedMap.set(item.phone, item);
          }
        } else {
          // Fallback key using ID if no phone
          deduplicatedMap.set(`id-${item.id}-${item.is_facebook_data}`, item);
        }
      });

      const combinedData = Array.from(deduplicatedMap.values());

      combinedData.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setCompanies(combinedData);
    } catch (error: any) {
      console.error("Error fetching all companies:", error);
      toast.error("Database Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string | number, isFacebook: boolean) => {
    setSelectedItems((prev) => {
      const alreadySelected = prev.some((s) => s.id === id && s.isFacebook === isFacebook);
      if (alreadySelected) {
        return prev.filter((s) => !(s.id === id && s.isFacebook === isFacebook));
      }
      if (prev.length >= MAX_SELECT) {
        toast.warning(`Maximum ${MAX_SELECT} items can be selected at once`);
        return prev;
      }
      return [...prev, { id, isFacebook }];
    });
  };

  const isSelected = (id: string | number, isFacebook: boolean) =>
    selectedItems.some((s) => s.id === id && s.isFacebook === isFacebook);

  const clearSelection = () => {
    setSelectedItems([]);
    setSelectMode(false);
  };

  const handleBulkAssign = async (employeeId: string) => {
    if (selectedItems.length === 0) return;
    setAssigning(true);
    const nowIso = new Date().toISOString();

    try {
      // Separate regular companies from FB data
      const regularIds = selectedItems
        .filter((s) => !s.isFacebook)
        .map((s) => s.id as string);
      const fbIds = selectedItems
        .filter((s) => s.isFacebook)
        .map((s) => s.id as number);

      // Assign regular companies
      if (regularIds.length > 0) {
        const { error } = await supabase
          .from("companies")
          .update({ assigned_to_id: employeeId, assigned_at: nowIso })
          .in("id", regularIds);
        if (error) throw error;
      }

      // Assign FB data via facebook_data_shares
      if (fbIds.length > 0) {
        // Remove existing shares for this employee for these items first (avoid duplicates)
        const { error: deleteError } = await (supabase
          .from("facebook_data_shares" as any)
          .delete()
          .eq("employee_id", employeeId)
          .in("facebook_data_id", fbIds) as any);
        if (deleteError) throw deleteError;

        const sharesToInsert = fbIds.map((fbId) => ({
          facebook_data_id: fbId,
          employee_id: employeeId,
          created_at: nowIso,
        }));
        const { error: fbError } = await (supabase
          .from("facebook_data_shares" as any)
          .insert(sharesToInsert) as any);
        if (fbError) throw fbError;
      }

      const emp = employees.find((e) => e.id === employeeId);
      toast.success(
        `${selectedItems.length} item${selectedItems.length > 1 ? "s" : ""} assigned to ${emp?.display_name || "employee"} successfully!`
      );
      clearSelection();
      fetchAllCompanies();
    } catch (error: any) {
      toast.error(error.message || "Failed to assign items");
    } finally {
      setAssigning(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    if (role === "team_lead" || role === "paid_team_lead")
      return "bg-purple-100 text-purple-800 border-purple-300";
    return "bg-blue-100 text-blue-800 border-blue-300";
  };

  const getRoleLabel = (role: string) => {
    if (role === "team_lead") return "TL";
    if (role === "paid_team_lead") return "Paid TL";
    return "Emp";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-36">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-white">All Companies</h2>
        {userRole === "admin" && (
          <Button
            variant={selectMode ? "destructive" : "outline"}
            size="sm"
            className={`flex items-center gap-2 font-semibold ${!selectMode ? "bg-primary text-white hover:bg-primary/90 border-none" : ""}`}
            onClick={() => {
              if (selectMode) {
                clearSelection();
              } else {
                setSelectMode(true);
              }
            }}
          >
            {selectMode ? (
              <>
                <X className="h-4 w-4" />
                Cancel Select
              </>
            ) : (
              <>
                <CheckSquare className="h-4 w-4" />
                Bulk Assign
              </>
            )}
          </Button>
        )}
      </div>

      {/* Select hint */}
      {selectMode && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
          <CheckSquare className="h-4 w-4 flex-shrink-0" />
          Click on cards to select them (max {MAX_SELECT}). Then choose an employee below to assign.
        </div>
      )}

      {companies.length === 0 ? (
        <p className="text-muted-foreground">No companies in the system yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
          {companies.map((company) => {
            const isFb = !!company.is_facebook_data;
            const itemId = company.id;
            const selected = isSelected(itemId, isFb);

            return (
              <div
                key={isFb ? `fb-${company.id}` : company.id}
                className="relative"
              >
                {/* Checkbox button — z-20 so it's above the overlay */}
                {selectMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(itemId, isFb); }}
                    className={`absolute top-3 left-3 z-20 rounded-md p-0.5 transition-all duration-150 shadow-md
                      ${selected
                        ? "bg-primary text-white scale-110"
                        : "bg-white/90 text-gray-400 hover:text-primary hover:bg-white"
                      }`}
                    title={selected ? "Deselect" : "Select"}
                  >
                    {selected ? (
                      <CheckSquare className="h-5 w-5" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </button>
                )}

                {/* Transparent overlay in select mode — sits above card (z-10) to capture clicks */}
                {selectMode && (
                  <div
                    className="absolute inset-0 z-10 cursor-pointer rounded-lg"
                    onClick={() => toggleSelect(itemId, isFb)}
                  />
                )}

                {/* Card with highlight ring when selected */}
                <div
                  className={`rounded-lg transition-all duration-150 h-full
                    ${selected ? "ring-2 ring-primary ring-offset-2" : ""}
                  `}
                >
                  {isFb ? (
                    <FacebookDataCard
                      data={company}
                      onUpdate={fetchAllCompanies}
                      userRole={userRole}
                      onDelete={() => { }}
                    />
                  ) : (
                    <CompanyCard
                      company={company}
                      onUpdate={fetchAllCompanies}
                      showAssignedTo
                      canDelete={userRole === "admin"}
                      userRole={userRole}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky Bottom Assignment Panel */}
      {selectMode && selectedItems.length > 0 && (
        <div className="fixed bottom-0 left-0 md:left-64 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-white/10 shadow-2xl py-4 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Badge className="bg-primary text-white text-sm px-3 py-1 font-bold">
                  {selectedItems.length} / {MAX_SELECT} selected
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Click an employee/TL to assign these items
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={clearSelection} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>

            {/* Employees list */}
            <div className="flex flex-wrap gap-2">
              {employees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No employees found.</p>
              ) : (
                employees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => handleBulkAssign(emp.id)}
                    disabled={assigning}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-primary hover:border-primary hover:text-white transition-all duration-150 text-sm font-medium group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {assigning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="h-4 w-4 text-primary group-hover:text-white transition-colors" />
                    )}
                    <span>{emp.display_name}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 py-0 border ${getRoleBadgeColor(emp.role)} group-hover:bg-white/20 group-hover:text-white group-hover:border-white/30`}
                    >
                      {getRoleLabel(emp.role)}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllCompaniesView;
