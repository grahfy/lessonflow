"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Pagination } from "@/components/pagination";

interface AdminTableProps {
  header?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  emptyLabel?: string;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
  };
}

/**
 * Standard table container for admin lists.
 * Handles header, scrollable list, and pagination.
 */
export function AdminTable({ 
  header, 
  children, 
  loading, 
  emptyLabel = "No items found.",
  pagination 
}: AdminTableProps) {
  return (
    <div className="admin-card invoice-list-card admin-table-card">
      <div className="admin-list-scroll admin-table-scroll">
        <div className="admin-table-inner">
          {header && (
            <div className="admin-table-header-row is-sticky">
              {header}
            </div>
          )}
          <div className="admin-table-body">
            {children}
            {loading && (!children || (Array.isArray(children) && children.length === 0)) && (
              <div className="admin-table-loading">
                <Loader2 className="admin-spin" />
                <span>retrieving data...</span>
              </div>
            )}
            {!loading && (!children || (Array.isArray(children) && children.length === 0)) && (
              <p className="helper-text admin-table-empty">{emptyLabel}</p>
            )}
          </div>
        </div>
      </div>

      {pagination && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          onPageChange={pagination.onPageChange}
          pageSize={pagination.pageSize}
          onPageSizeChange={pagination.onPageSizeChange}
          totalCount={pagination.totalCount}
          pageSizeOptions={pagination.pageSizeOptions || [15, 25, 50, 100, 250]}
        />
      )}
    </div>
  );
}

export const AdminTableSeparator = () => <div className="admin-table-separator" />;
