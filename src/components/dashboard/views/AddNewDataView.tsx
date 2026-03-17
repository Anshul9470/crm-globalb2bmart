import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, ClipboardPaste, ListPlus, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AddNewDataViewProps {
  userId: string;
  userRole?: string;
}

const AddNewDataView = ({ userId, userRole }: AddNewDataViewProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    owner_name: "",
    phone: "",
    email: "",
    address: "",
    products_services: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check for duplicate company before inserting
      // A duplicate is defined as: same company_name AND same phone
      // Also check email if provided (case-insensitive)
      const trimmedCompanyName = formData.company_name.trim();
      const trimmedPhone = formData.phone.trim();
      const trimmedEmail = formData.email?.trim() || "";

      // First check: company_name + phone match
      const duplicateQuery = supabase
        .from("companies")
        .select("id, company_name, phone, email")
        .eq("company_name", trimmedCompanyName)
        .eq("phone", trimmedPhone)
        .is("deleted_at", null);

      const { data: existingCompanies, error: checkError } = await duplicateQuery;

      if (checkError) {
        throw checkError;
      }

      // If we found a match with company_name + phone, it's a duplicate
      if (existingCompanies && existingCompanies.length > 0) {
        // If email is also provided, verify it matches too
        if (trimmedEmail) {
          const emailMatch = existingCompanies.some(
            (company) => company.email &&
              company.email.toLowerCase().trim() === trimmedEmail.toLowerCase()
          );

          if (emailMatch) {
            toast.error("This company already exists in the database. The company name, phone number, and email match an existing entry.");
            setLoading(false);
            return;
          }
        } else {
          toast.error("This company already exists in the database. The company name and phone number match an existing entry.");
          setLoading(false);
          return;
        }
      }

      // Additional check: if email is provided, also check for email-only duplicates
      // (in case someone enters same email with different company name/phone)
      if (trimmedEmail) {
        const emailDuplicateQuery = supabase
          .from("companies")
          .select("id, company_name, phone, email")
          .ilike("email", trimmedEmail)
          .is("deleted_at", null);

        const { data: emailMatches, error: emailCheckError } = await emailDuplicateQuery;

        if (!emailCheckError && emailMatches && emailMatches.length > 0) {
          // Check if it's the same company (same name or phone)
          const isSameCompany = emailMatches.some(
            (company) =>
              (company.company_name && company.company_name.trim().toLowerCase() === trimmedCompanyName.toLowerCase()) ||
              (company.phone && company.phone.trim() === trimmedPhone)
          );

          if (isSameCompany) {
            toast.error("This company already exists in the database. The email address matches an existing entry.");
            setLoading(false);
            return;
          }
        }
      }

      // No duplicate found, proceed with insertion
      // If created by employee, set approval_status to 'pending'
      // If created by admin, leave approval_status as NULL (no approval needed)
      const insertData: any = {
        ...formData,
        created_by_id: userId,
        assigned_to_id: null, // Company is not assigned until admin assigns it
      };

      // EVERY new company starts as 'pending' for approval
      // This way it shows up in the Company Approval view for the Admin to review.
      const needsApproval = true;
      insertData.approval_status = "pending";

      let { error } = await supabase.from("companies").insert([insertData]);

      // If error is due to missing approval_status column, retry without it
      if (error && (error.message?.includes("approval_status") || error.message?.includes("column") || error.code === "42703")) {
        console.warn("approval_status column not found, inserting without it. Please run the migration.");
        // Remove approval_status and retry
        delete insertData.approval_status;
        const retryResult = await supabase.from("companies").insert([insertData]);
        error = retryResult.error;

        if (!error) {
          toast.warning("Company added, but approval system is not set up. Please run the database migration.");
        }
      }

      if (error) throw error;

      if (needsApproval && insertData.approval_status) {
        toast.success("Company added successfully! It is pending admin approval.");
      } else {
        toast.success("Company added successfully! It will be assigned by an admin.");
      }
      setFormData({
        company_name: "",
        owner_name: "",
        phone: "",
        email: "",
        address: "",
        products_services: "",
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to add company");
    } finally {
      setLoading(false);
    }
  };

  const [bulkData, setBulkData] = useState("");
  const [importing, setImporting] = useState(false);

  const parseCSV = (text: string) => {
    // Bulletproof CSV parser handling inner quotes and newlines
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentVal = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentVal += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === ',' || char === '\t') && !inQuotes) {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\r' && !inQuotes) {
        // ignore CR outside quotes
      } else if (char === '\n' && !inQuotes) {
        currentRow.push(currentVal.trim());
        if (currentRow.some(val => val !== '')) rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }

    // Push the very last item if exists
    if (currentVal || currentRow.length > 0) {
      currentRow.push(currentVal.trim());
      if (currentRow.some(val => val !== '')) rows.push(currentRow);
    }

    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase());

    const data = rows.slice(1).map((row, rowIndex) => {
      const obj: any = {};
      headers.forEach((header: string, index: number) => {
        const val = row[index];
        if (val === undefined || val === null || val === "") return;

        const h = header.trim().toLowerCase();
        
        // Smarter Company Name detection - only set if not already set
        if (!obj.company_name && (h.includes("company") || h.includes("business") || h.includes("organization") || h === "name")) {
          obj.company_name = val;
        } 
        // Smarter Owner Name detection
        else if (!obj.owner_name && (h.includes("owner") || h.includes("person") || h.includes("client name") || h.includes("geeta"))) {
          obj.owner_name = val;
        }
        // Smarter Phone detection
        else if (!obj.phone && (h.includes("phone") || h.includes("mobile") || h.includes("contact") || h.includes("tel") || h === "ph" || h === "no" || h.includes("gluser") || h === "id")) {
          // Extra check: if it's a name like "Geeta", skip it for phone
          if (isNaN(Number(val.toString().substring(0, 1)))) {
             // If first char is not a number, maybe try next header
             return;
          }
          obj.phone = val;
        }
        else if (!obj.email && h.includes("email")) obj.email = val;
        else if (!obj.address && (h.includes("address") || h.includes("location") || h.includes("city"))) obj.address = val;
        else if (!obj.products_services && (h.includes("product") || h.includes("service") || h.includes("comment"))) obj.products_services = val;
      });
      return obj;
    });
    return data;
  };

  const handleBulkImport = async (text: string) => {
    if (!text.trim()) {
      toast.error("Please paste data or upload a file first");
      return;
    }

    setImporting(true);
    try {
      const parsedData = parseCSV(text);
      if (parsedData.length === 0) {
        toast.error("Invalid format. Please include headers (Company, Owner, Phone, Email, etc.)");
        setImporting(false);
        return;
      }

      // Filter out incomplete rows and create a unique identifier for each
      const validRows = parsedData
        .filter(row => row.company_name && row.phone)
        .map(row => ({
          ...row,
          // Generate a composite key to help with duplicate detection
          _identifier: row.phone.toString().trim(),
        }));

      if (validRows.length === 0) {
        console.log("Parsed Data Sample:", parsedData.slice(0, 2));
        toast.error("No valid data found. Make sure 'Company' and 'Phone/ID' columns are present.");
        setImporting(false);
        return;
      }

      toast.info(`Checking ${validRows.length} companies for duplicates... please wait.`);

      // 1. Remove duplicates WITHIN the uploaded file itself
      const uniqueUploadsMap = new Map();
      let fileDuplicateCount = 0;
      for (const row of validRows) {
        if (!uniqueUploadsMap.has(row._identifier)) {
          uniqueUploadsMap.set(row._identifier, row);
        } else {
          fileDuplicateCount++;
        }
      }

      const uniqueUploads = Array.from(uniqueUploadsMap.values());

      // 2. Fetch all existing company names and phones from the database to check for duplicates
      const existingIdentifiers = new Set();
      const chunkSize = 200;

      for (let i = 0; i < uniqueUploads.length; i += chunkSize) {
        const chunk = uniqueUploads.slice(i, i + chunkSize);
        const phoneList = chunk.map(row => row.phone.toString());

        const { data: existingDB } = await supabase
          .from("companies")
          .select("phone")
          .in("phone", phoneList)
          .is("deleted_at", null);

        if (existingDB) {
          existingDB.forEach((dbRow: any) => {
            existingIdentifiers.add(dbRow.phone.toString().trim());
          });
        }
      }

      // 3. Filter out rows that already exist in the database
      let dbDuplicateCount = 0;
      const rowsToInsert = uniqueUploads.filter((row: any) => {
        if (existingIdentifiers.has(row._identifier)) {
          dbDuplicateCount++;
          return false;
        }
        return true;
      });

      const totalDuplicates = fileDuplicateCount + dbDuplicateCount;

      if (rowsToInsert.length === 0) {
        toast.warning(`All data (${totalDuplicates} rows) are already in the database. No new companies added.`);
        setBulkData("");
        setImporting(false);
        return;
      }

      toast.info(`Importing ${rowsToInsert.length} new companies...`);

      // 4. Batch insert into the database
      let successCount = 0;
      let lastErrorMessage = "";
      const insertBatchSize = 500;

      for (let i = 0; i < rowsToInsert.length; i += insertBatchSize) {
        const batch = rowsToInsert.slice(i, i + insertBatchSize);

        const insertData = batch.map(row => {
          const { _identifier, ...dbRow } = row;
          return {
            company_name: dbRow.company_name || "Unknown Company",
            owner_name: dbRow.owner_name || "N/A",
            phone: dbRow.phone || "0000000000",
            email: dbRow.email || "",
            address: dbRow.address || "",
            products_services: dbRow.products_services || "",
            created_by_id: userId,
            assigned_to_id: null,
            approval_status: "pending",
          };
        });

        const { error } = await supabase.from("companies").insert(insertData);

        if (error) {
          console.warn(`Batch insert error: ${error.message}.`);
          lastErrorMessage = error.message;
          
          let singleSuccess = 0;
          for (const insertRow of insertData) {
            const { error: singleError } = await supabase.from("companies").insert([insertRow]);
            if (!singleError) {
              singleSuccess++;
            } else {
              lastErrorMessage = singleError.message;
            }
          }
          successCount += singleSuccess;
        } else {
          successCount += batch.length;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully imported ${successCount} companies. ${totalDuplicates} matching duplicates skipped.`);
        setBulkData("");
      } else {
        toast.error(`Import Failed: ${lastErrorMessage || "Check if data format is correct"}`);
      }
    } catch (error: any) {
      console.error("Bulk import failed:", error);
      toast.error(error.message || "Bulk import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setBulkData(text);
      toast.success("File loaded. Click 'Process Bulk Data' to import.");
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-white text-center">Add Company Data</h2>

      {userRole === "admin" ? (
        <Tabs defaultValue="single" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 bg-[#1e293b] p-1 border border-white/10">
            <TabsTrigger value="single" className="flex items-center gap-2 text-white data-[state=active]:bg-blue-600">
              <Plus className="h-4 w-4" /> Single Entry
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2 text-white data-[state=active]:bg-green-600">
              <Upload className="h-4 w-4" /> Bulk Import (CSV)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <Card className="bg-[#1e293b] border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Single Company Information</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="company_name" className="text-white">Company Name *</Label>
                    <Input
                      id="company_name"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      className="bg-[#0f172a] border-white/10 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner_name" className="text-white">Owner Name *</Label>
                    <Input
                      id="owner_name"
                      value={formData.owner_name}
                      onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                      className="bg-[#0f172a] border-white/10 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-white">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="bg-[#0f172a] border-white/10 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="bg-[#0f172a] border-white/10 text-white"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="address" className="text-white">Address</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="bg-[#0f172a] border-white/10 text-white min-h-[100px]"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="products_services" className="text-white">Products & Services</Label>
                    <Textarea
                      id="products_services"
                      value={formData.products_services}
                      onChange={(e) => setFormData({ ...formData, products_services: e.target.value })}
                      className="bg-[#0f172a] border-white/10 text-white min-h-[100px]"
                    />
                  </div>
                  <div className="md:col-span-2 pt-4">
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-11" disabled={loading}>
                      {loading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
                      ) : "Add Company"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk">
            <Card className="bg-[#1e293b] border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  Bulk Import (CSV/Excel/Copy-Paste)
                  <div className="text-xs font-normal text-slate-400 mt-1">
                    Required: Company Name, Phone
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-white font-semibold flex items-center gap-2">
                      <Upload className="h-4 w-4" /> Upload CSV/Text File
                    </Label>
                    <Input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="bg-[#0f172a] border-white/10 text-white cursor-pointer"
                    />
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-white/10"></span>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-[#1e293b] px-2 text-muted-foreground">OR</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="text-white font-semibold flex items-center gap-2">
                      <ClipboardPaste className="h-4 w-4" /> Copy-Paste from Excel/Docs
                    </Label>
                    <Textarea
                      placeholder="Paste your data here (with headers like Company, Phone, Owner...)"
                      value={bulkData}
                      onChange={(e) => setBulkData(e.target.value)}
                      className="bg-[#0f172a] border-white/10 text-white min-h-[250px] font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    onClick={() => handleBulkImport(bulkData)}
                    className="w-full bg-green-600 hover:bg-green-700 h-11"
                    disabled={importing || !bulkData.trim()}
                  >
                    {importing ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <><ListPlus className="mr-2 h-4 w-4" /> Process Bulk Data</>
                    )}
                  </Button>
                </div>

                <div className="bg-[#0f172a] p-4 rounded-lg border border-white/10">
                  <h4 className="text-sm font-semibold text-blue-400 mb-2">Instructions:</h4>
                  <ul className="text-xs text-slate-300 list-disc pl-4 space-y-1">
                    <li>Keep the first row as **Headers** (e.g. `Company, Owner, Phone, Email, Address, Products`).</li>
                    <li>Copy rows from Excel or Google Sheets and paste them directly into the box.</li>
                    <li>Duplicates will be skipped automatically based on Company Name and Phone.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="bg-[#1e293b] border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Single Company Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="company_name" className="text-white">Company Name *</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="bg-[#0f172a] border-white/10 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner_name" className="text-white">Owner Name *</Label>
                <Input
                  id="owner_name"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  className="bg-[#0f172a] border-white/10 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-white">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="bg-[#0f172a] border-white/10 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-[#0f172a] border-white/10 text-white"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="address" className="text-white">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="bg-[#0f172a] border-white/10 text-white min-h-[100px]"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="products_services" className="text-white">Products & Services</Label>
                <Textarea
                  id="products_services"
                  value={formData.products_services}
                  onChange={(e) => setFormData({ ...formData, products_services: e.target.value })}
                  className="bg-[#0f172a] border-white/10 text-white min-h-[100px]"
                />
              </div>
              <div className="md:col-span-2 pt-4">
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-11" disabled={loading}>
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
                  ) : "Add Company"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AddNewDataView;
