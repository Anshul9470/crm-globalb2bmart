import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches Facebook data filtered by comment category
 */
export async function fetchFacebookDataByCategory(
  userId: string,
  userRole: string | undefined,
  category: "hot" | "follow_up" | "block" | "general"
): Promise<any[]> {
  try {
    let fbData: any[] = [];

    if (userRole === "employee") {
      // For employees, get shared Facebook data
      const { data: shares } = await (supabase
        .from("facebook_data_shares" as any)
        .select("facebook_data_id, id, created_at")
        .eq("employee_id", userId) as any);

      if (shares && shares.length > 0) {
        const fbIds = shares.map((s: any) => s.facebook_data_id);
        // Create a map of facebook_data_id to share date
        const shareDateMap: Record<number, string> = {};
        shares.forEach((share: any) => {
          if (share.created_at) {
            shareDateMap[share.facebook_data_id] = share.created_at;
          }
        });
        
        const { data } = await (supabase
          .from("facebook_data" as any)
          .select("*")
          .in("id", fbIds) as any);

        // Attach shared_at to each Facebook data item
        fbData = (data || []).map((fb: any) => ({
          ...fb,
          shared_at: shareDateMap[fb.id] || null
        }));
      }
    } else if (userRole === "admin") {
      // For admins, get all Facebook data
      const { data } = await (supabase
        .from("facebook_data" as any)
        .select("*") as any);

      fbData = data || [];
    }

    if (fbData.length === 0) return [];

    // Fetch comments for Facebook data
    try {
      const fbIds = fbData.map((fb: any) => fb.id);
      const { data: comments } = await (supabase
        .from("facebook_data_comments" as any)
        .select(`
          id,
          facebook_data_id,
          comment_text,
          category,
          comment_date,
          created_at,
          user_id,
          user:profiles!user_id(display_name, email)
        `)
        .in("facebook_data_id", fbIds) as any);

      // Attach comments to Facebook data
      const fbWithComments = fbData.map((fb: any) => ({
        ...fb,
        comments: (comments || [])
          .filter((c: any) => c.facebook_data_id === fb.id)
          .sort(
            (a: any, b: any) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ),
      }));

      // Filter Facebook data with the specified category
      const filteredFbData = fbWithComments.filter((fb: any) => {
        if (!fb.comments || fb.comments.length === 0) return false;
        const latestComment = fb.comments[0];
        return latestComment && latestComment.category === category;
      });

      return filteredFbData;
    } catch (err) {
      console.warn("Could not fetch Facebook comments:", err);
      return [];
    }
  } catch (error) {
    console.error("Error fetching Facebook data by category:", error);
    return [];
  }
}

