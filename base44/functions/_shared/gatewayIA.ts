// ================================================================
// gatewayIA — Wrapper backend para o gateway invokeGpt (OpenAI direta)
// Substitui as integrações Core de IA sem consumir créditos Base44.
// Cada função recebe o client base44 em escopo (app ou asServiceRole)
// e chama base44.functions.invoke('invokeGpt', { operation, payload }).
// ================================================================

type Base44Client = any;

async function callGateway(base44: Base44Client, operation: string, payload: any) {
  const res = await base44.functions.invoke('invokeGpt', { operation, payload });
  const data = res?.data ?? res;
  if (data && data.ok === false) {
    throw new Error(data.error || `invokeGpt falhou (${operation})`);
  }
  return data?.result;
}

export async function invokeLLM(base44: Base44Client, payload: any): Promise<any> {
  return callGateway(base44, 'InvokeLLM', payload);
}

export async function extractDataFromUploadedFile(base44: Base44Client, payload: any): Promise<any> {
  return callGateway(base44, 'ExtractDataFromUploadedFile', payload);
}

export async function generateImage(base44: Base44Client, payload: any): Promise<any> {
  return callGateway(base44, 'GenerateImage', payload);
}

export async function generateSpeech(base44: Base44Client, payload: any): Promise<any> {
  return callGateway(base44, 'GenerateSpeech', payload);
}

export async function transcribeAudio(base44: Base44Client, payload: any): Promise<any> {
  return callGateway(base44, 'TranscribeAudio', payload);
}