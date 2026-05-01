import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * NativeSelect: Uses bottom sheet drawer on mobile, regular select on desktop
 * Optimized for mobile form selection without obscuring content
 */
export default function NativeSelect({
  value,
  onValueChange,
  placeholder = 'Selecione',
  items = [],
  label,
  disabled = false,
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile && items.length > 0) {
    return (
      <div className="space-y-1.5">
        {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
        
        <button
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md bg-white text-left hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className={value ? 'text-gray-900' : 'text-gray-500'}>
            {items.find((i) => i.value === value)?.label || placeholder}
          </span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{label || placeholder}</DrawerTitle>
            </DrawerHeader>
            <div className="max-h-72 overflow-y-auto pb-8">
              {items.map((item) => (
                <button
                  key={item.value}
                  onClick={() => {
                    onValueChange(item.value);
                    setOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-200 transition-colors ${
                    value === item.value
                      ? 'bg-blue-50 text-blue-900 font-semibold'
                      : 'text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // Desktop: use standard Select
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}