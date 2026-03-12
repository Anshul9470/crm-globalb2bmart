import { User } from "@supabase/supabase-js";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogOut, Menu, RefreshCw, User as UserIcon } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Logo from "/logo.jpeg";


interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

interface DashboardLayoutProps {
  menuItems: MenuItem[];
  currentView: string;
  onViewChange: (view: string) => void;
  user: User;
  userName?: string;
  onLogout: () => void;
  children: ReactNode;
}

const DashboardLayout = ({
  menuItems,
  currentView,
  onViewChange,
  user,
  userName,
  onLogout,
  children,
}: DashboardLayoutProps) => {
  const displayName = userName || user.email?.split("@")[0] || "User";
  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-sidebar-border text-white">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2">
            <img 
              src={Logo} 
              alt="Logo" 
              className="h-12 w-12 object-contain" 
              style={{ maxWidth: '60px' }}
            />
            <p className="text-xs text-white/80 text-center">WebWave Business Pvt. Ltd</p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.reload()}
            title="Refresh data"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={currentView === item.id ? "default" : "ghost"}
                className="w-full justify-between"
                onClick={() => onViewChange(item.id)}
              >
                <div className="flex items-center flex-1 min-w-0">
                  <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className="ml-2 bg-white/90 text-black rounded-full px-2 py-0.5 text-xs font-bold min-w-[24px] text-center flex-shrink-0">
                    {item.count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-sidebar-border space-y-2">
        {/* User Info */}
        <div className="px-3 py-2 rounded-lg bg-white/10 flex items-center gap-2 mb-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 flex-shrink-0">
            <UserIcon className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            <p className="text-xs text-white/70 truncate">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start text-white" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4 text-white" />
          Logout
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 flex-col bg-sidebar-background border-r border-sidebar-border text-white">
        <SidebarContent />
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="md:hidden">
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex flex-col items-center gap-1">
            <img 
              src={Logo} 
              alt="Logo" 
              className="h-10 w-10 object-contain" 
              style={{ maxWidth: '50px' }}
            />
            <p className="text-xs text-muted-foreground text-center">WebWave Business Pvt. Ltd</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.reload()}
              title="Refresh data"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar-background">
                <div className="flex flex-col h-full">
                  <SidebarContent />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
