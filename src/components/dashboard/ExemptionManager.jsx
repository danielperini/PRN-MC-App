import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function ExemptionManager({ currentMonth, currentYear }) {
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [motivo, setMotivo] = useState('');
  const queryClient = useQueryClient();

  const { data: professionals = [] } = useQuery({
    queryKey: ['exemption-professionals'],
    queryFn: async () => {
      const data = await base44.asServiceRole.entities.User.filter(
        { role: 'PROFISSIONAL' },
        '-created_date',
        500
      );
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: exemptions = [] } = useQuery({
    queryKey: ['exemptions-list', currentMonth, currentYear],
    queryFn: async () => {
      const data = await base44.asServiceRole.entities.ReportExemption.filter(
        { mes_referencia: currentMonth, ano: currentYear },
        '-created_date',
        500
      );
      return Array.isArray(data) ? data : [];
    },
  });

  const createExemption = useMutation({
    mutationFn: async (data) => {
      const user = await base44.auth.me();
      await base44.asServiceRole.entities.ReportExemption.create({
        user_email: data.user_email,
        user_name: data.user_name,
        mes_referencia: currentMonth,
        ano: currentYear,
        motivo: data.motivo,
        desobrigado_por_email: user.email,
        desobrigado_por_nome: user.full_name,
      });
    },
    onSuccess: () => {
      toast.success('Usuário desobrigado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['exemptions-list', currentMonth, currentYear] });
      queryClient.invalidateQueries({ queryKey: ['compliance-exemptions', currentMonth, currentYear] });
      setOpen(false);
      setSelectedUser('');
      setMotivo('');
    },
    onError: () => toast.error('Erro ao desobrigar usuário'),
  });

  const deleteExemption = useMutation({
    mutationFn: async (id) => {
      await base44.asServiceRole.entities.ReportExemption.delete(id);
    },
    onSuccess: () => {
      toast.success('Desobrigação removida');
      queryClient.invalidateQueries({ queryKey: ['exemptions-list', currentMonth, currentYear] });
      queryClient.invalidateQueries({ queryKey: ['compliance-exemptions', currentMonth, currentYear] });
    },
    onError: () => toast.error('Erro ao remover desobrigação'),
  });

  const handleSubmit = () => {
    if (!selectedUser || !motivo.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    const user = professionals.find(p => p.email === selectedUser);
    createExemption.mutate({ user_email: selectedUser, user_name: user?.full_name || '', motivo });
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-black">Desobrigações de Relatório</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-black hover:bg-gray-800 text-white">
              <Plus className="w-4 h-4" /> Desobrigar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desobrigar Profissional - {currentMonth} {currentYear}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-black mb-2 block">Profissional</label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map(p => (
                      <SelectItem key={p.email} value={p.email}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-black mb-2 block">Motivo da Desobrigação</label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Descreva o motivo..."
                  className="min-h-24"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={createExemption.isPending}
                  className="bg-black hover:bg-gray-800 text-white"
                >
                  Desobrigar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {exemptions.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Nenhum profissional desobrigado neste mês</p>
        ) : (
          exemptions.map(e => (
            <div key={e.id} className="flex items-start justify-between p-3 border border-gray-100 rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium text-black">{e.user_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{e.user_email}</p>
                {e.motivo && <p className="text-xs text-gray-600 mt-1">{e.motivo}</p>}
              </div>
              <button
                onClick={() => deleteExemption.mutate(e.id)}
                disabled={deleteExemption.isPending}
                className="text-gray-400 hover:text-red-500 transition-colors ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}