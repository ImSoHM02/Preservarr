import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Moon, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface HeaderProps {
  title?: string;
}

export default function Header({ title = "Dashboard" }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="cmp-header__root">
      <header className="cmp-header__prop-background-color">
        <div className="cmp-header__flex-gap-4-items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Toggle Sidebar</p>
            </TooltipContent>
          </Tooltip>
          <h1 className="cmp-header__text-xl-font-semibold" data-testid="text-page-title">
            {title}
          </h1>
        </div>

        <div className="cmp-appsidebar__flex-gap-2-items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleThemeToggle}
            data-testid="button-theme-toggle"
            aria-label="Toggle theme"
          >
            {mounted &&
              (theme === "dark" ? (
                <Sun className="cmp-appsidebar__height-4-width-4" />
              ) : (
                <Moon className="cmp-appsidebar__height-4-width-4" />
              ))}
            {!mounted && <Sun className="cmp-appsidebar__height-4-width-4" />}
          </Button>
        </div>
      </header>
    </div>
  );
}
