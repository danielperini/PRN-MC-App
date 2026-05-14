import React from 'react';
import { TrendingUp, Users, FileSearch, Activity } from 'lucide-react';

function toNumber(v){const n=Number(v||0);return Number.isFinite(n)?n:0;}
function fmt(v){return Math.round(toNumber(v)).toLocaleString('pt-BR');}

function Card({title,value,helper,icon:Icon}){
 return (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
   <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-2">
    <Icon className="w-4 h-4" />{title}
   </div>
   <div className="text-2xl font-bold text-foreground">{value}</div>
   <div className="text-xs text-muted-foreground mt-1">{helper}</div>
  </div>
 )
}

export default function InstitutionalInsightsPanel({reports=[]}){
 const activities=reports.flatMap(r=>Array.isArray(r.atividades)?r.atividades:[]);
 const publicTotal=activities.reduce((s,a)=>s+toNumber(a.publico_total||a.publico_estimado||0),0);
 const approved=reports.filter(r=>String(r.status||'').includes('APPRO')).length;
 const museums=[...new Set(reports.map(r=>r.museu).filter(Boolean))];
 const growth=Math.min(100,Math.round((approved/Math.max(reports.length,1))*100));

 return (
  <section className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
   <div>
    <h2 className="text-lg font-semibold text-foreground">Leitura institucional</h2>
    <p className="text-xs text-muted-foreground mt-1">Painel executivo consolidado a partir dos relatórios e atividades aprovadas.</p>
   </div>
   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    <Card title="Público consolidado" value={fmt(publicTotal)} helper="atividades com público registrado" icon={Users} />
    <Card title="Atividades registradas" value={fmt(activities.length)} helper="ações cadastradas nos relatórios" icon={Activity} />
    <Card title="Relatórios aprovados" value={fmt(approved)} helper={`${growth}% do total enviado`} icon={FileSearch} />
    <Card title="Museus ativos" value={fmt(museums.length)} helper={museums.join(' · ') || 'sem dados'} icon={TrendingUp} />
   </div>
  </section>
 )
}
