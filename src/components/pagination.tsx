"use client";

import React from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange?: (pageSize: number) => void;
  totalCount: number;
  pageSizeOptions?: number[];
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalCount,
  pageSizeOptions = [25, 50, 100]
}: PaginationProps) {
  if (totalCount === 0) return null;

  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="pagination-container" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      borderTop: '1px solid var(--line)',
      background: 'rgba(0,0,0,0.05)',
      fontSize: '0.85rem',
      color: 'var(--ink-1)'
    }}>
      <div className="pagination-info">
        Showing <strong>{startRange}</strong> to <strong>{endRange}</strong> of <strong>{totalCount}</strong>
      </div>

      <div className="pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {onPageSizeChange && (
          <div className="page-size-selector" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="pageSize">Per page:</label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                background: 'var(--bg-2)',
                color: 'var(--ink-0)',
                border: '1px solid var(--line)',
                borderRadius: '4px',
                padding: '2px 4px',
                fontSize: '0.8rem'
              }}
            >
              {pageSizeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        )}

        <div className="page-buttons" style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '4px 10px', minWidth: '0', fontSize: '0.75rem' }}
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            PREV
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontWeight: 600 }}>
            Page {currentPage} of {totalPages}
          </div>

          <button
            className="btn btn-secondary"
            style={{ padding: '4px 10px', minWidth: '0', fontSize: '0.75rem' }}
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
}
