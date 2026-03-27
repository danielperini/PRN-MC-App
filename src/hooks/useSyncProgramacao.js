export async function syncProgramacao() {
  try {
    const res = await base44.functions.syncProgramacao();
    console.log("SYNC OK:", res);
    return res;
  } catch (error) {
    console.error("SYNC ERROR:", error);
    throw error;
  }
}
