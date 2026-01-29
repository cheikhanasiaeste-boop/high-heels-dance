import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { FilterOption, ColumnFilter } from "@/lib/table-filters";

interface ColumnFilterUIProps {
  columns: {
    name: string;
    label: string;
    options: FilterOption[];
  }[];
  filters: ColumnFilter;
  onFilterChange: (filters: ColumnFilter) => void;
  activeFilterCount: number;
  onClearAll: () => void;
}

export function ColumnFilterUI({
  columns,
  filters,
  onFilterChange,
  activeFilterCount,
  onClearAll,
}: ColumnFilterUIProps) {
  return (
    <div className="space-y-3 p-4 border-b bg-accent/30">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFilterCount} active
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="text-xs"
          >
            Clear all
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {columns.map((column) => (
          <div key={column.name} className="flex items-center gap-2">
            <Select
              value={filters[column.name]?.[0] || ""}
              onValueChange={(value) => {
                const newFilters = { ...filters };
                if (value === "") {
                  newFilters[column.name] = [];
                } else {
                  newFilters[column.name] = [value];
                }
                onFilterChange(newFilters);
              }}
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder={`Filter by ${column.label}`} />
              </SelectTrigger>
              <SelectContent>
                {column.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {option.count !== undefined && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({option.count})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filters[column.name]?.length > 0 && (
              <button
                onClick={() => {
                  const newFilters = { ...filters };
                  newFilters[column.name] = [];
                  onFilterChange(newFilters);
                }}
                className="p-0 hover:bg-destructive/10 rounded"
              >
                <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
