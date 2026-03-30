// 🔴 SOMENTE ALTERAÇÃO NO FINAL DO ARQUIVO (TeamMemberForm CALL)

<TeamMemberForm
  isOpen={showForm}
  onClose={() => {
    setShowForm(false);
    setEditingMember(null);
  }}
  onSuccess={async (result) => {
    await refreshAll();

    // 🔥 CORREÇÃO: diferencia ADD vs EDIT
    if (editingMember) {
      toast.success('Dados da equipe atualizados com sucesso');
    } else {
      toast.success('Novo membro adicionado com sucesso');
    }

    setShowForm(false);
    setEditingMember(null);
  }}
  editingMember={editingMember}
  budgetLines={budgetLines}
/>
