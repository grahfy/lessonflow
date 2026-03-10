"use client";

import type { ReactNode } from "react";
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
      {header && (
        <div className="invoice-list-header admin-table-header-row">
          {header}
        </div>
      )}
      
      <div className="admin-list-scroll admin-table-scroll">
        <div className="admin-table-body">
          {children}
          {!loading && (!children || (Array.isArray(children) && children.length === 0)) && (
            <p className="helper-text admin-table-empty">{emptyLabel}</p>
          )}
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
