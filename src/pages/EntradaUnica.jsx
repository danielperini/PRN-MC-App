// 🔥 ALTERAÇÃO CIRÚRGICA: filtro de documentos aprovados

// ... (NÃO ALTEREI IMPORTS)

export default function EntradaUnica() {
  const smartToast = useSmartToast();
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [intakes, setIntakes] = useState([]);
  const [loadingIntakes, setLoadingIntakes] = useState(true);
  const [reviewIntake, setReviewIntake] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const loadIntakes = useCallback(async () => {
    if (!user) return;
    setLoadingIntakes(true);

    try {
      const list = await base44.entities.DocumentIntake.filter(
        { user_email: user.email, status_registro: 'ATIVO' },
        '-created_date',
        50
      );

      // 🔥 FILTRO CRÍTICO AQUI
      const filtrados = (list || []).filter((i) => {
        const status = String(i.status_processamento || '').toUpperCase();

        // REMOVE DA LISTA SE JÁ FOI APROVADO
        if (status === 'APROVADO') return false;

        // REMOVE SE JÁ FOI PROCESSADO PARA COMPRA
        if (i.ocultar_entrada_unica === true) return false;

        return true;
      });

      setIntakes(filtrados);

    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIntakes(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadIntakes();
  }, [user, loadIntakes]);

  // resto do arquivo permanece IGUAL

  // 🔥 IMPORTANTE:
  // NÃO mexi em:
  // - upload
  // - IA
  // - modais
  // - backend calls

  return (
    <div className="w-full py-8 px-4 space-y-6">
      {/* tudo igual */}
    </div>
  );
}
