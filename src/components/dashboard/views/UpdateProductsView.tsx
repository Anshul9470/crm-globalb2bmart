import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, Package, CheckCircle2 } from "lucide-react";

// This tool updates ONLY the products_services field for existing companies
// matched by phone number — without deleting or re-importing anything else.
const UpdateProductsView = () => {
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<{ updated: number; notFound: number; skipped: number } | null>(null);

  const parseProductsFromCSV = (text: string): { phone: string; products: string }[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const separator = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/"/g, ""));

    // Find phone and product column indices
    const phoneIdx = headers.findIndex(h =>
      h.includes("phone") || h.includes("mobile") || h.includes("contact") || h === "ph" || h === "no"
    );
    const productIdx = headers.findIndex(h =>
      h === "products_services" || h.includes("product") || h.includes("service") ||
      h.includes("item") || h.includes("category") || h.includes("deal") || h.includes("goods") || h.includes("desc")
    );

    if (phoneIdx === -1 || productIdx === -1) {
      toast.error(`Could not find Phone column (idx=${phoneIdx}) or Products column (idx=${productIdx}). Headers: ${headers.join(", ")}`);
      return [];
    }

    const results: { phone: string; products: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ""));
      const phone = (cols[phoneIdx] || "").replace(/\D/g, "").slice(-10);
      const products = (cols[productIdx] || "").trim();
      if (phone.length >= 10 && products) {
        results.push({ phone, products });
      }
    }
    return results;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setStats(null);

    try {
      const text = await file.text();
      const rows = parseProductsFromCSV(text);

      if (rows.length === 0) {
        toast.error("No valid rows found. Make sure your file has Phone and Products columns.");
        setImporting(false);
        return;
      }

      toast.info(`Found ${rows.length} rows with product info. Updating database...`);

      let updated = 0;
      let notFound = 0;
      let skipped = 0;

      // Process in batches of 100
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const phones = batch.map(r => r.phone);

        // Fetch existing records
        const { data: existing } = await supabase
          .from("companies")
          .select("id, phone, products_services")
          .in("phone", phones)
          .is("deleted_at", null);

        if (!existing) continue;

        const existingMap = new Map(existing.map((r: any) => [r.phone, r]));

        for (const row of batch) {
          const record = existingMap.get(row.phone);
          if (!record) {
            notFound++;
            continue;
          }

          // Update products_services
          const { error } = await (supabase
            .from("companies" as any)
            .update({ products_services: row.products })
            .eq("id", record.id) as any);

          if (!error) {
            updated++;
          } else {
            console.error("Update error:", error);
            skipped++;
          }
        }
      }

      setStats({ updated, notFound, skipped });
      if (updated > 0) {
        toast.success(`✅ Updated ${updated} companies with product info!`);
        window.dispatchEvent(new Event("companyDataUpdated"));
      } else {
        toast.warning("No companies were updated. Check if phone numbers match.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update products");
    } finally {
      setImporting(false);
      // Reset file input
      e.target.value = "";
    }
  };

  return (
    <Card className="glass-card border border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Package className="h-5 w-5 text-primary" />
          Update Products from Excel
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload your Excel/CSV file to update the "Products" field for existing companies (matched by phone number). This will NOT delete or re-import any data.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              onChange={handleFileUpload}
              disabled={importing}
              className="hidden"
            />
            <Button
              asChild
              variant="outline"
              className="bg-primary text-white hover:bg-primary/80 border-primary"
              disabled={importing}
            >
              <span>
                {importing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Upload Excel / CSV</>
                )}
              </span>
            </Button>
          </label>
          <p className="text-xs text-muted-foreground">
            File must have <strong>Phone</strong> and <strong>Products/Products_Services</strong> columns.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
              <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-500">{stats.updated}</p>
              <p className="text-xs text-muted-foreground">Updated</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-500">{stats.notFound}</p>
              <p className="text-xs text-muted-foreground">Phone not found</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-500">{stats.skipped}</p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UpdateProductsView;
