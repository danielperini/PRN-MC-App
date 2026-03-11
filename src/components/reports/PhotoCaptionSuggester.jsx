import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PhotoCaptionSuggester({ photoUrl, activityId, reportId, onCaptionSuggested }) {
  const [loading, setLoading] = useState(false);

  const handleSuggestCaption = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('suggestPhotoCaption', {
        photoUrl,
        activityId,
        reportId
      });

      if (response.data?.success && response.data?.caption) {
        onCaptionSuggested(response.data.caption);
        toast.success('Legenda sugerida com sucesso!');
      } else {
        toast.error('Não foi possível sugerir uma legenda');
      }
    } catch (error) {
      toast.error('Erro ao sugerir legenda: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSuggestCaption}
      disabled={loading}
      variant="outline"
      size="sm"
      className="gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Wand2 className="w-4 h-4" />
      )}
      Sugerir Legenda
    </Button>
  );
}