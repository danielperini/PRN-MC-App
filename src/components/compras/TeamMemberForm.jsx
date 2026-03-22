// ... (todo o arquivo permanece igual até o handleSubmit)

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const numeroParcelas = Math.max(1, parseInt(form.numero_parcelas, 10) || 1);
      const parcelasPagas = Math.max(0, parseInt(form.parcelas_pagas, 10) || 0);
      const valorTotal = toNumber(form.valor_total);
      const valorParcela = valorTotal / numeroParcelas;

      const data = {
        ...form,

        // 🔥 CORREÇÃO CRÍTICA AQUI
        budgetline_id: form.budgetline_id,
        budget_line_id: form.budgetline_id,
        rubrica_id: form.budgetline_id,

        valor_total: valorTotal,
        numero_parcelas: numeroParcelas,
        parcelas_pagas: parcelasPagas,
        valor_parcela: valorParcela,
        data_criacao: form.data_criacao || new Date().toISOString().split('T')[0],
        status: form.status || 'ATIVO',
      };

      let memberId;
      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, data);
        memberId = editingMember.id;
      } else {
        const created = await base44.entities.TeamMember.create(data);
        memberId = created.id;
      }

      if (form.contrato_url && memberId) {
        try {
          const driveRes = await base44.functions.invoke('saveContractToDrive', {
            file_url: form.contrato_url,
            member_name: form.user_name,
            member_id: memberId,
          });

          await base44.entities.TeamMember.update(memberId, {
            contrato_url: driveRes.data.driveLink,
          });

          const fileName = `Contrato_${form.user_name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
          await base44.entities.Attachment.create({
            activity_id: memberId,
            file_name: fileName,
            file_type: 'application/pdf',
            file_url: driveRes.data.driveLink,
            description: `Contrato vinculado a ${form.user_name} (${form.user_email}) | Objeto: ${form.objeto_contrato?.substring(0, 80) || 'N/A'}`,
            user_email: form.user_email,
            team_member_id: memberId,
          });

          toast.success('✅ Contrato vinculado e armazenado no Google Drive com sucesso!');
        } catch (driveError) {
          console.error('Erro ao vinculação do contrato:', driveError);
          toast.error('Membro salvo, mas erro ao vincular contrato. Tente novamente.');
        }
      }

      if (editingMember?.id) {
        toast.success('✅ Membro atualizado com sucesso!');
      } else {
        toast.success('✅ Membro adicionado à equipe com sucesso!');
      }

      onSuccess();
      onClose();
    } catch (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
