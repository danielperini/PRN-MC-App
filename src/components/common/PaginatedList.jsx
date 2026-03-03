import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PaginatedList({ items = [], itemsPerPage = 10, children }) {
  const [currentPage, setCurrentPage] = useState(0);
  
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIdx = currentPage * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedItems = items.slice(startIdx, endIdx);

  const goToPage = (page) => {
    const pageNum = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(pageNum);
  };

  return (
    <div className="space-y-4">
      {/* Items */}
      <div>
        {children(paginatedItems)}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Mostrando {startIdx + 1}-{Math.min(endIdx, items.length)} de {items.length}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            {Array.from({ length: totalPages }).map((_, i) => (
              <Button
                key={i}
                variant={currentPage === i ? 'default' : 'outline'}
                size="sm"
                className="w-8 h-8 px-0"
                onClick={() => goToPage(i)}
              >
                {i + 1}
              </Button>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}