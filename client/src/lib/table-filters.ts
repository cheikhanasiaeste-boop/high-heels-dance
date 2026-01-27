/**
 * Table filtering utilities for extracting and filtering column values
 */

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface ColumnFilter {
  [columnName: string]: string[];
}

/**
 * Extract unique values from a column across all rows
 */
export function getColumnValues<T extends Record<string, any>>(
  data: T[],
  columnKey: keyof T,
  formatter?: (value: any) => string
): FilterOption[] {
  const valueMap = new Map<string, number>();

  data.forEach((row) => {
    const value = row[columnKey];
    if (value !== null && value !== undefined) {
      const displayValue = formatter ? formatter(value) : String(value);
      valueMap.set(displayValue, (valueMap.get(displayValue) || 0) + 1);
    }
  });

  return Array.from(valueMap.entries())
    .map(([value, count]) => ({
      value,
      label: value,
      count,
    }))
    .sort((a, b) => b.count! - a.count!);
}

/**
 * Filter rows based on multiple column filters
 */
export function filterRows<T extends Record<string, any>>(
  data: T[],
  filters: ColumnFilter,
  columnFormatters?: Record<string, (value: any) => string>
): T[] {
  return data.filter((row) => {
    for (const [columnName, filterValues] of Object.entries(filters)) {
      if (filterValues.length === 0) continue;

      const columnValue = row[columnName];
      if (columnValue === null || columnValue === undefined) return false;

      const formatter = columnFormatters?.[columnName];
      const displayValue = formatter ? formatter(columnValue) : String(columnValue);

      if (!filterValues.includes(displayValue)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Get active filter count
 */
export function getActiveFilterCount(filters: ColumnFilter): number {
  return Object.values(filters).reduce((sum, values) => sum + values.length, 0);
}

/**
 * Clear all filters
 */
export function clearAllFilters(filters: ColumnFilter): ColumnFilter {
  const cleared: ColumnFilter = {};
  for (const key of Object.keys(filters)) {
    cleared[key] = [];
  }
  return cleared;
}
