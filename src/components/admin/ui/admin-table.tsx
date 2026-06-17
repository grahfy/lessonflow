"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Pagination } from "@/components/pagination";

interface AdminTableProps {
  header?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  /**
   * Optional skeleton placeholder shown (instead of the default spinner) while
   * loading with no rows yet. Pass a shape matching this table's columns so the
   * placeholder occupies the same footprint and avoids layout shift.
   */
  loadingSkeleton?: ReactNode;
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
  loadingSkeleton,
  emptyLabel = "No items found.",
  pagination
}: AdminTableProps) {
  return (
    <div className="admin-card invoice-list-card admin-table-card">
      {/*
        A11y: the list is horizontally/vertically scrollable, so it must be
        reachable and operable by keyboard (axe scrollable-region-focusable,
        WCAG 2.1.1). Exposing it as a labelled, focusable region lets keyboard
        users scroll the table without a pointer.
      */}
      <div className="admin-list-scroll admin-table-scroll" role="region" aria-label="Table contents" tabIndex={0}>
        <div className="admin-table-inner">
          {header && (
            <div className="admin-table-header-row is-sticky">
              {header}
            </div>
          )}
          <div className="admin-table-body">
            {children}
            {loading && (!children || (Array.isArray(children) && children.length === 0)) && (
              loadingSkeleton ?? (
                <div className="admin-table-loading">
                  <Loader2 className="admin-spin" />
                  <span>retrieving data...</span>
                </div>
              )
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
