// 🔧 IMPORTANTE: ADICIONE ESTE IMPORT NO TOPO
import { Checkbox } from '@/components/ui/checkbox';

// 🔧 SUBSTITUA APENAS ESTE COMPONENTE NO SEU ARQUIVO

function PermissionsDialog({ user, open, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);

  const role = user.permission?.base_role || user.role || user.role_aprovada || 'PROFISSIONAL';
  const isCoord = role === 'COORDENADOR' || role === 'ADMIN';

  const [permissions, setPermissions] = useState({
    can_review_reports: user?.permission?.can_review_reports || false,
    can_manage_users: user?.permission?.can_manage_users || false,
    can_manage_files: user?.permission?.can_manage_files || false,
    can_view_audit_log: user?.permission?.can_view_audit_log || false,
    can_manage_platform: user?.permission?.can_manage_platform || false,
    gestao_compras: user?.permission?.gestao_compras || false,
    pode_aprovar_solicitacoes: user?.permission?.pode_aprovar_solicitacoes || false,
    must_submit_monthly_reports: user?.permission?.must_submit_monthly_reports || false,
  });

  function toggle(key) {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  async function handleSave() {
    setSaving(true);

    try {
      const payload = {
        base_role: role,
        user_email: normalizeEmail(user.email),
        user_name: user.full_name || user.nome || user.email,
        funcao: user.funcao || '',
        equipe: user.equipe || '',
        area: user.area || user.museu || '',
        museu: user.area || user.museu || '',
        ...permissions,
      };

      // 🔒 Coordenador = acesso total
      if (isCoord) {
        Object.keys(payload).forEach((k) => {
          if (
            k.startsWith('can_') ||
            k.includes('gestao') ||
            k.includes('aprovar')
          ) {
            payload[k] = true;
          }
        });
      }

      if (user.permission?.id) {
        await base44.entities.UserPermission.update(user.permission.id, payload);
      } else {
        await base44.entities.UserPermission.create(payload);
      }

      toast.success('Permissões atualizadas com sucesso.');
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error('Erro ao salvar permissões.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permissões do usuário</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">

          {Object.entries(permissions).map(([key, value]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              
              <Checkbox
                checked={isCoord ? true : value}
                disabled={isCoord}
                onCheckedChange={() => toggle(key)}
              />

              <span className="capitalize">
                {key.replace(/_/g, ' ')}
              </span>
            </label>
          ))}

        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Salvando...' : 'Salvar permissões'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
