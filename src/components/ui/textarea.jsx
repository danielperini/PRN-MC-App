import * as React from "react"

import { cn } from "@/lib/utils"

function sanitizeFieldName(value = "") {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
}

const Textarea = React.forwardRef(({ className, id, name, ...props }, ref) => {
  const generatedId = React.useId()
  const safeId = id || `field-${sanitizeFieldName(generatedId)}`
  const safeName = name || safeId

  return (
    (<textarea
      id={safeId}
      name={safeName}
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
