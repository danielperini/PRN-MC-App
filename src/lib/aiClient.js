// ================================================================
// aiClient — Camada de IA própria via OpenAI (sem créditos Base44)
// Redireciona as integrações Core de IA para a função backend
// `invokeGpt`, que chama a OpenAI diretamente com a chave
// OPENAI_API_KEY (do app), preservando as mesmas assinaturas.
// ================================================================

import { base44 } from '@/api/base44Client';

async function callGateway(operation, payload) {
  const res = await base44.functions.invoke('invokeGpt', { operation, payload });
  const data = res?.data ?? res;
  if (data && data.ok === false) {
    throw new Error(data.error || `invokeGpt falhou (${operation})`);
  }
  return data?.result;
}

/** Equivalente a Core.InvokeLLM — retorna string ou dict (quando response_json_schema). */
export async function InvokeLLM(payload) {
  return callGateway('InvokeLLM', payload);
}

/** Equivalente a Core.GenerateImage — retorna { url }. */
export async function GenerateImage(payload) {
  return callGateway('GenerateImage', payload);
}

/** Equivalente a Core.GenerateSpeech — retorna { url } (data URL MP3). */
export async function GenerateSpeech(payload) {
  return callGateway('GenerateSpeech', payload);
}

/** Equivalente a Core.TranscribeAudio — retorna string (transcrição). */
export async function TranscribeAudio(payload) {
  return callGateway('TranscribeAudio', payload);
}

/** Equivalente a Core.ExtractDataFromUploadedFile — retorna { status, output }. */
export async function ExtractDataFromUploadedFile(payload) {
  return callGateway('ExtractDataFromUploadedFile', payload);
}

/** Equivalente a Core.GenerateVideo — indisponível via OpenAI direta. */
export async function GenerateVideo() {
  throw new Error('Geração de vídeo não está disponível via OpenAI direta. Use a integração nativa do Base44.');
}

export default {
  InvokeLLM,
  GenerateImage,
  GenerateSpeech,
  TranscribeAudio,
  ExtractDataFromUploadedFile,
  GenerateVideo,
};