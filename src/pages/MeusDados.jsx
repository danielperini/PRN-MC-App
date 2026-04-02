// 🔥 ADIÇÃO: auto-completar dados ao carregar (SEM sobrescrever)

useEffect(() => {
  if (!user?.email) return;

  const runAutoComplete = async () => {
    try {
      await base44.functions.invoke('ensureTeamMemberDataComplete', {
        user_email: selectedUserEmail || user.email,
      });

      // 🔥 recarrega dados após completar
      const rows = await base44.entities.TeamMember.filter({
        user_email: selectedUserEmail || user.email,
      });

      const member = rows?.[0];
      if (!member) return;

      setFormData((prev) => ({
        ...prev,
        banco: prev.banco || member.banco || '',
        agencia: prev.agencia || member.agencia || '',
        conta: prev.conta || member.conta || '',
        pix_key: prev.pix_key || member.pix_key || '',
        cpf: prev.cpf || member.cpf || '',
        cnpj: prev.cnpj || member.cnpj || '',
      }));

      console.log('✔ Dados sincronizados automaticamente (sem sobrescrever)');
    } catch (e) {
      console.warn('Erro auto-complete (não bloqueante)', e);
    }
  };

  runAutoComplete();
}, [user?.email, selectedUserEmail]);
