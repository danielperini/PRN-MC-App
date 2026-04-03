import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import ReportTabsNavigation from '@/components/reports/ReportTabsNavigation';
import AtividadesSection from '@/components/reports/AtividadesSection';
import AttachmentsSection from '@/components/reports/AttachmentsSection';
import ReportPhotoSection from '@/components/reports/ReportPhotoSection';
import DepoimentosSection from '@/components/reports/DepoimentosSection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function ReportEditor() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('relatorio');

  const [form, setForm] = useState({
    atividades: [],
    fotos: [],
    depoimentos: [],
    attachments: [],
  });

  useEffect(() => {
    async function init() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const reportId = urlParams.get('id');

        if (reportId) {
          const data = await base44.entities.Report.get(reportId);
          setReport(data);
          setForm(prev => ({ ...prev, ...data }));
          return;
        }

        const newReport = await base44.entities.Report.create({
          status: 'DRAFT',
          atividades: [],
          fotos: [],
          depoimentos: [],
          attachments: [],
        });

        setReport(newReport);

        window.history.replaceState({}, '', `/ReportEditor?id=${newReport.id}`);
      } catch (error) {
        toast.error('Erro ao carregar relatório');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const handleSave = async () => {
    if (!report?.id) return;

    setSaving(true);
    try {
      await base44.entities.Report.update(report.id, form);
      toast.success('Relatório salvo');
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center">Carregando...</div>;
  }

  if (!report?.id) {
    return <div className="p-10 text-center">Erro ao carregar relatório</div>;
  }

  return (
    <div className="space-y-6">

      <ReportTabsNavigation
        currentTab={activeTab}
        formData={form}
        onTabChange={setActiveTab}
      />

      <Card className="p-6">

        {activeTab === 'relatorio' && (
          <div className="space-y-4">
            <div>
              <Label>Resumo do período</Label>
              <Textarea
                value={form.resumo_periodo || ''}
                onChange={(e) =>
                  setForm(prev => ({ ...prev, resumo_periodo: e.target.value }))
                }
              />
            </div>

            <div>
              <Label>Resumo executivo</Label>
              <Textarea
                value={form.resumo_executivo || ''}
                onChange={(e) =>
                  setForm(prev => ({ ...prev, resumo_executivo: e.target.value }))
                }
              />
            </div>
          </div>
        )}

        {activeTab === 'atividades' && (
          <AtividadesSection
            reportId={report.id}
            atividades={form.atividades}
            setAtividades={(v) => setForm(prev => ({ ...prev, atividades: v }))}
            mesReferencia={form.mes_referencia}
            ano={form.ano}
            museu={form.museu}
            onSave={handleSave}
          />
        )}

        {activeTab === 'fotos' && (
          <ReportPhotoSection
            reportId={report.id}
            activityId={null}
            photos={form.fotos}
            onAddPhoto={(p) =>
              setForm(prev => ({ ...prev, fotos: [...prev.fotos, p] }))
            }
            onUpdatePhoto={(id, caption) =>
              setForm(prev => ({
                ...prev,
                fotos: prev.fotos.map(f => f.id === id ? { ...f, caption } : f)
              }))
            }
            onDeletePhoto={(id) =>
              setForm(prev => ({
                ...prev,
                fotos: prev.fotos.filter(f => f.id !== id)
              }))
            }
          />
        )}

        {activeTab === 'attachments' && (
          <AttachmentsSection
            reportId={report.id}
            reportData={form}
            canEdit
          />
        )}

        {activeTab === 'depoimentos' && (
          <DepoimentosSection
            depoimentos={form.depoimentos}
            onChange={(v) => setForm(prev => ({ ...prev, depoimentos: v }))}
            canEdit
            museu={form.museu}
          />
        )}

      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/Relatorios')}>
          Cancelar
        </Button>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
}
