import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, X, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SearchBarProps {
  onSearch?: (query: string) => void;
  onFilterToggle?: () => void;
  onLayoutSettingsToggle?: () => void;
  placeholder?: string;
  activeFilters?: string[];
  onRemoveFilter?: (filter: string) => void;
}

export default function SearchBar({
  onSearch,
  onFilterToggle,
  onLayoutSettingsToggle,
  placeholder = "Search games...",
  activeFilters = [],
  onRemoveFilter,
}: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    console.warn(`Search triggered: ${searchQuery}`);
    onSearch?.(searchQuery);
  };

  // Trigger search on input change for live search
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    console.warn(`Search input change: ${value}`);
    onSearch?.(value);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onSearch?.("");
  };

  const handleFilterClick = () => {
    console.warn("Filter toggle triggered");
    onFilterToggle?.();
  };

  const handleRemoveFilter = (filter: string) => {
    console.warn(`Remove filter triggered: ${filter}`);
    onRemoveFilter?.(filter);
  };

  return (
    <div className="cmp-loadingfallback__space-y-3">
      <form onSubmit={handleSearch} className="cmp-igdbsearchmodal__flex-gap-2">
        <div className="cmp-igdbsearchmodal__flex-1-relative">
          <Search className="cmp-searchbar__search-icon" />
          <Input
            type="search"
            placeholder={placeholder}
            value={searchQuery}
            onChange={handleInputChange}
            className="cmp-searchbar__padding-left-10-padding-right-10"
            data-testid="input-search"
            aria-label="Search games"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cmp-searchbar__clear-button"
              onClick={handleClearSearch}
              aria-label="Clear search"
              data-testid="button-clear-search"
            >
              <X className="cmp-searchbar__height-4-width-4" />
            </Button>
          )}
        </div>
        <Button type="submit" variant="default" data-testid="button-search" aria-label="Search">
          <Search className="cmp-appsidebar__height-4-width-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleFilterClick}
          data-testid="button-filter"
          aria-label="Toggle filters"
        >
          <Filter className="cmp-appsidebar__height-4-width-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onLayoutSettingsToggle}
          data-testid="button-layout-settings"
          aria-label="Toggle layout settings"
        >
          <LayoutGrid className="cmp-appsidebar__height-4-width-4" />
        </Button>
      </form>

      {activeFilters.length > 0 && (
        <div className="cmp-searchbar__flex-gap-2-flex-wrap">
          {activeFilters.map((filter) => (
            <Badge
              key={filter}
              variant="secondary"
              className="cmp-searchbar__gap-1"
              data-testid={`filter-${filter.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {filter}
              <Button
                variant="ghost"
                size="icon"
                className="cmp-searchbar__clear-icon-button"
                onClick={() => handleRemoveFilter(filter)}
                aria-label={`Remove filter: ${filter}`}
                data-testid={`button-remove-filter-${filter.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <X className="cmp-searchbar__height-3-width-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
