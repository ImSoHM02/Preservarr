import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Moon, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  COLOR_THEME_LABELS,
  isColorTheme,
  useColorTheme,
} from "@/lib/color-theme";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface HeaderProps {
  title?: string;
}

export default function Header({ title = "Dashboard" }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { colorTheme, colorThemes, setColorTheme } = useColorTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleColorThemeChange = (value: string) => {
    if (isColorTheme(value)) {
      setColorTheme(value);
    }
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
          <Select value={colorTheme} onValueChange={handleColorThemeChange}>
            <SelectTrigger className="cmp-header__theme-select-trigger" aria-label="Select color theme">
              <SelectValue placeholder="Color Theme" />
            </SelectTrigger>
            <SelectContent>
              {colorThemes.map((option) => (
                <SelectItem key={option} value={option}>
                  {COLOR_THEME_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
