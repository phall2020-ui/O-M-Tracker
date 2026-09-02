'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { SiteWithCalculations } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, ChevronDown, ChevronUp, Search, Eye, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

const columnHelper = createColumnHelper<SiteWithCalculations>();

interface SitesTableProps {
  data: SiteWithCalculations[];
  onEdit?: (site: SiteWithCalculations) => void;
  onDelete?: (site: SiteWithCalculations) => void;
  isLoading?: boolean;
}

export function SitesTable({ data, onEdit, onDelete, isLoading }: SitesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() => column.toggleSorting()}
          >
            Site Name
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: (info) => (
          <Link 
            href={`/sites/${info.row.original.id}`}
            className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor('systemSizeKwp', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() => column.toggleSorting()}
          >
            Size (kWp)
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: (info) => formatNumber(info.getValue(), 2),
      }),
      columnHelper.accessor('contractStatus', {
        header: 'Contract',
        cell: (info) => (
          <Badge variant={info.getValue() === 'Yes' ? 'success' : 'default'}>
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('onboardDate', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() => column.toggleSorting()}
          >
            Onboard Date
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: (info) => {
          const date = info.getValue();
          if (!date) return <span className="text-gray-400">—</span>;
          return new Date(date).toLocaleDateString('en-GB');
        },
      }),
      columnHelper.accessor('spvCode', {
        header: 'SPV',
        cell: (info) => info.getValue() || <span className="text-gray-400">—</span>,
      }),
      columnHelper.accessor('siteFixedCosts', {
        header: 'Site Costs',
        cell: (info) => formatCurrency(info.getValue()),
      }),
      columnHelper.accessor('fixedFee_20MW', {
        header: 'Fixed Fee (<20MW)',
        cell: (info) => formatCurrency(info.getValue()),
      }),
      columnHelper.accessor('feePerKwp_20MW', {
        header: '£/kWp (<20MW)',
        cell: (info) => {
          const val = info.getValue();
          return val > 0 ? formatNumber(val, 2) : <span className="text-gray-400">—</span>;
        },
      }),
      columnHelper.accessor('monthlyFee', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() => column.toggleSorting()}
          >
            Monthly Fee
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: (info) => {
          const val = info.getValue();
          return val > 0 ? formatCurrency(val) : <span className="text-gray-400">—</span>;
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Link href={`/sites/${row.original.id}`}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Eye className="h-4 w-4" />
              </Button>
            </Link>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(row.original)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete(row.original)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      }),
    ],
    [onEdit, onDelete]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search sites..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No sites found. Import your data or add a new site.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="whitespace-nowrap px-4 py-3 text-sm text-gray-700"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-500">
        Showing {table.getRowModel().rows.length} of {data.length} sites
      </div>
    </div>
  );
}
