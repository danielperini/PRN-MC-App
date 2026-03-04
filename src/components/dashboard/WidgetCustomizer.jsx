import React from 'react';
import { Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

export default function WidgetCustomizer({ widgets, onToggleWidget, onReset }) {
  const [isOpen, setIsOpen] = React.useState(false);

  const sortedWidgets = Object.entries(widgets)
    .sort(([, a], [, b]) => a.position - b.position);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2 border-gray-300"
      >
        <Settings className="w-4 h-4" />
        Personalizar
      </Button>

      {isOpen && (
        <Card className="absolute right-0 top-12 w-72 p-4 shadow-xl z-50 border-gray-300">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-black">Widgets</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="text-xs gap-1 h-7"
              >
                <RotateCcw className="w-3 h-3" />
                Resetar
              </Button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {sortedWidgets.map(([widgetId, widget]) => (
                <div
                  key={widgetId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <Checkbox
                    checked={widget.enabled}
                    onCheckedChange={() => onToggleWidget(widgetId)}
                    className="mt-0.5"
                  />
                  <label className="text-sm text-gray-700 cursor-pointer flex-1">
                    {widget.title}
                  </label>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500 mt-4 italic">
              Ative ou desative widgets para personalizar sua visualização
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}