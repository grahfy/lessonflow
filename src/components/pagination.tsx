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
    <div className="pagination-container">
      <div className="pagination-info">
        Showing <strong>{startRange}</strong> to <strong>{endRange}</strong> of <strong>{totalCount}</strong>
      </div>

      <div className="pagination-controls">
        {onPageSizeChange && (
          <div className="page-size-selector">
            <label htmlFor="pageSize">Per page:</label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        )}

        <div className="page-buttons">
          <button
            className="btn btn-secondary btn-xs pagination-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            PREV
          </button>
          
          <div className="pagination-page-indicator">
            Page {currentPage} of {totalPages}
          </div>

          <button
            className="btn btn-secondary btn-xs pagination-btn"
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
