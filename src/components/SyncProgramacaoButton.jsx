import React, { useState } from "react";
import { syncProgramacao } from "../hooks/useSyncProgramacao";

export default function SyncProgramacaoButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);

    try {
      const res = await syncProgramacao();

      alert(
        `Sync OK\nItens: ${res.total_items}\nCriados: ${res.created}`
      );
    } catch (e) {
      alert("Erro no sync");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? "Sincronizando..." : "Sincronizar Programação"}
    </button>
  );
}
