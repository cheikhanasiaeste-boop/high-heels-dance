import { describe, it, expect } from 'vitest';
import {
  getColumnValues,
  filterRows,
  getActiveFilterCount,
  clearAllFilters,
  type FilterOption,
  type ColumnFilter,
} from './table-filters';

describe('table-filters', () => {
  const mockData = [
    { id: 1, name: 'Alice', role: 'admin', status: 'active' },
    { id: 2, name: 'Bob', role: 'user', status: 'active' },
    { id: 3, name: 'Charlie', role: 'user', status: 'inactive' },
    { id: 4, name: 'Diana', role: 'admin', status: 'active' },
  ];

  describe('getColumnValues', () => {
    it('should extract unique values from a column', () => {
      const values = getColumnValues(mockData, 'role');
      expect(values).toHaveLength(2);
      expect(values.map(v => v.value)).toContain('admin');
      expect(values.map(v => v.value)).toContain('user');
    });

    it('should count occurrences of each value', () => {
      const values = getColumnValues(mockData, 'role');
      const adminValue = values.find(v => v.value === 'admin');
      const userValue = values.find(v => v.value === 'user');
      expect(adminValue?.count).toBe(2);
      expect(userValue?.count).toBe(2);
    });

    it('should apply formatter function if provided', () => {
      const values = getColumnValues(mockData, 'status', (v) => v.toUpperCase());
      expect(values.map(v => v.value)).toContain('ACTIVE');
      expect(values.map(v => v.value)).toContain('INACTIVE');
    });

    it('should sort by count descending', () => {
      const values = getColumnValues(mockData, 'status');
      expect(values[0].count).toBeGreaterThanOrEqual(values[1].count);
    });
  });

  describe('filterRows', () => {
    it('should return all rows when no filters are applied', () => {
      const filters: ColumnFilter = { role: [], status: [] };
      const result = filterRows(mockData, filters);
      expect(result).toHaveLength(4);
    });

    it('should filter by single column', () => {
      const filters: ColumnFilter = { role: ['admin'], status: [] };
      const result = filterRows(mockData, filters);
      expect(result).toHaveLength(2);
      expect(result.every(r => r.role === 'admin')).toBe(true);
    });

    it('should filter by multiple columns (AND logic)', () => {
      const filters: ColumnFilter = { role: ['admin'], status: ['active'] };
      const result = filterRows(mockData, filters);
      expect(result).toHaveLength(2);
      expect(result.every(r => r.role === 'admin' && r.status === 'active')).toBe(true);
    });

    it('should apply formatter when filtering', () => {
      const filters: ColumnFilter = { status: ['ACTIVE'] };
      const result = filterRows(mockData, filters, {
        status: (v) => v.toUpperCase(),
      });
      expect(result).toHaveLength(3);
      expect(result.every(r => r.status === 'active')).toBe(true);
    });

    it('should return empty array when no rows match filters', () => {
      const filters: ColumnFilter = { role: ['nonexistent'], status: [] };
      const result = filterRows(mockData, filters);
      expect(result).toHaveLength(0);
    });
  });

  describe('getActiveFilterCount', () => {
    it('should return 0 when no filters are active', () => {
      const filters: ColumnFilter = { role: [], status: [] };
      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it('should count active filters', () => {
      const filters: ColumnFilter = { role: ['admin'], status: ['active'] };
      expect(getActiveFilterCount(filters)).toBe(2);
    });

    it('should count multiple values in same column', () => {
      const filters: ColumnFilter = { role: ['admin', 'user'], status: [] };
      expect(getActiveFilterCount(filters)).toBe(2);
    });
  });

  describe('clearAllFilters', () => {
    it('should clear all filters', () => {
      const filters: ColumnFilter = { role: ['admin'], status: ['active'] };
      const cleared = clearAllFilters(filters);
      expect(cleared.role).toHaveLength(0);
      expect(cleared.status).toHaveLength(0);
    });

    it('should preserve filter structure', () => {
      const filters: ColumnFilter = { role: ['admin'], status: ['active'] };
      const cleared = clearAllFilters(filters);
      expect(Object.keys(cleared)).toEqual(Object.keys(filters));
    });
  });
});
