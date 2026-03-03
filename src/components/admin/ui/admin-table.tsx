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
    <div className="admin-card invoice-list-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {header && (
        <div className="customer-item invoice-item invoice-list-header" style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          gap: '12px',
          width: '100%',
          border: 'none',
          borderBottom: '1px solid var(--line)',
          background: 'rgba(8, 11, 28, 0.84)',
          borderRadius: 0,
          flexShrink: 0
        }}>
          {header}
        </div>
      )}
      
      <div className="admin-list-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: 'none', gap: '0', padding: 0, background: 'rgba(8, 11, 28, 0.84)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '0', flex: 1 }}>
          {children}
          {!loading && (!children || (Array.isArray(children) && children.length === 0)) && (
            <p className="helper-text" style={{ padding: '20px' }}>{emptyLabel}</p>
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
          pageSizeOptions={pagination.pageSizeOptions || [25, 50, 100, 250]}
        />
      )}
    </div>
  );
}

export const AdminTableSeparator = () => <div style={{ width: '1px', height: '24px', background: 'var(--line)', flexShrink: 0 }} />;
