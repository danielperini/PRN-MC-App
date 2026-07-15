import { base44 } from '@/api/base44Client';

export function installActivityGalleryPdfRouting() {
  if (typeof window === 'undefined') return;
  if (window.__activityGalleryPdfRoutingInstalled) return;
  window.__activityGalleryPdfRoutingInstalled = true;

  const originalInvoke = base44?.functions?.invoke?.bind(base44.functions);
  if (!originalInvoke) return;

  base44.functions.invoke = (functionName, payload, ...rest) => {
    const routedFunctionName = functionName === 'generateReportPDF'
      ? 'generateReportPDFActivityGallery'
      : functionName;

    return originalInvoke(routedFunctionName, payload, ...rest);
  };
}
