import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RevincularRubricasOrfasDrawer from '@/components/financeiro/RevincularRubricasOrfasDrawer';

export default function RevincularRubricasOrfasButton({ onConcluido }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-2 border-red-400 text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <AlertTriangle className="h-4 w-4" />
        Revínculo de Rubricas
      </Button>
      <RevincularRubricasOrfasDrawer
        open={open}
        onClose={() => setOpen(false)}
        onConcluido={onConcluido}
      />
    </>
  );
}