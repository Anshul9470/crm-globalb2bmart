import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CompanyCard from "@/components/CompanyCard";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DeletedDataViewProps {
  userId: string;
}

const DeletedDataView = ({ userId }: DeletedDataViewProps) => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeletedCompanies();
  }, [userId]);

  const fetchDeletedCompanies = async () => {
    setLoading(true);
    
    try {
      console.log("Fetching all deleted companies...");
      
      // Get all deleted companies without any assignment filter
      const { data, error } = await supabase
        .from("companies")
        .select(`
          *,
          comments (
            id,
            comment_text,
            category,
            comment_date,
            created_at
          ),
          assigned_to:assigned_to_id (
            id,
            display_name
          )
        `)
        .filter('is_deleted', 'eq', true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching deleted companies:", error);
        toast.error("Failed to load deleted companies");
        return;
      }

      console.log("Query successful, deleted companies found:", data?.length || 0);
      
      if (data && data.length > 0) {
        // Sort comments by created_at descending for each company
        const companiesWithSortedComments = data.map(company => ({
          ...company,
          comments: company.comments?.sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ) || []
        }));
        setCompanies(companiesWithSortedComments);
        console.log("Deleted companies loaded:", companiesWithSortedComments.length);
      } else {
        console.log("No deleted companies found");
        setCompanies([]);
      }
    } catch (error) {
      console.error("Error in fetchDeletedCompanies:", error);
      toast.error("An error occurred while loading deleted companies");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (companyId: string) => {
    try {
      const { error } = await supabase
        .from("companies")
        .update({ is_deleted: false })
        .eq("id", companyId);

      if (error) throw error;

      // Refresh the list
      fetchDeletedCompanies();
    } catch (error: any) {
      console.error("Error restoring company:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Deleted Data</h2>
      {companies.length === 0 ? (
        <p className="text-muted-foreground">No deleted companies found.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company: any) => (
            <div key={company.id} className="relative">
              <CompanyCard
                company={company}
                onUpdate={fetchDeletedCompanies}
                showAssignedTo={true}
              />
              <div className="mt-2">
                <button 
                  onClick={() => handleRestore(company.id)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded"
                >
                  Restore Company
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeletedDataView;