import React from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function MetaCard({ title, completed, total, color = 'bg-blue-500' }) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isComplete = completed >= total;

  return (
    <Card className="p-4 bg-white border-gray-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {completed} de {total}
          </p>
        </div>
        <span className={`text-lg font-bold ${isComplete ? 'text-green-600' : 'text-gray-700'}`}>
          {percentage}%
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
      {isComplete && (
        <p className="text-xs text-green-600 font-medium mt-2">✓ Meta atingida</p>
      )}
    </Card>
  );
}