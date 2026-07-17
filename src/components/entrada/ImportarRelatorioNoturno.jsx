import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle, AlertTriangle, XCircle, FileText, Camera, Users,
  ClipboardList, ChevronDown, ChevronUp, Loader2, Eye, Save, X, Activity
} from 'lucide-react';

const PDF_URL = 'https://media.base44.com/files/public/6a11dbeecf8f7a5977ffc750/2626e390e_RelatrioParcialdeProduo-11EdioNoturnonosMuseus-2026.pdf';

// ─── DADOS EXTRAÍDOS DO PDF (auditados, sem invenção) ───────────────────────

const AGENDA_REUNIOES = [
  { data: '2026-04-29', horario: '14h30', titulo: 'Reunião MROSC Museus Centro', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-05-13', horario: '14h30', titulo: 'Reunião MROSC Museus Centro', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-05-14', horario: '15h às 16h', titulo: 'Reunião site Noturno – Astim / DMUS / VAR', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-05-21', horario: '10h às 11h', titulo: 'Reunião Produção Noturno / VAR', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-05-21', horario: '11h às 11h30', titulo: 'Reunião Economia Solidária', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-05-21', horario: '15h às 16h', titulo: 'Visita Técnica MHAB', formato: 'Presencial', local: 'MHAB', tipo: 'visita técnica' },
  { data: '2026-05-21', horario: '', titulo: 'Visita Técnica – Programação MHAB', formato: 'Presencial', local: 'MHAB', tipo: 'visita técnica' },
  { data: '2026-05-27', horario: '14h30', titulo: 'Reunião MROSC Museus Centro', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-05-29', horario: '14h às 15h', titulo: 'Reunião Programação Noturno', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-06-03', horario: '10h às 11h', titulo: 'Follow Up Noturno', formato: 'Virtual', tipo: 'alinhamento' },
  { data: '2026-06-09', horario: '14h às 15h', titulo: 'Visita Técnica – Programação/Iluminação MAP', formato: 'Presencial', local: 'MAP', tipo: 'visita técnica' },
  { data: '2026-06-09', horario: '15h às 16h', titulo: 'Visita Técnica Programação/Iluminação MCK', formato: 'Presencial', local: 'MCK', tipo: 'visita técnica' },
  { data: '2026-06-09', horario: '16h30 às 17h30', titulo: 'Visita Técnica – Iluminação Casa do Baile', formato: 'Presencial', local: 'Casa do Baile', tipo: 'visita técnica' },
  { data: '2026-06-10', horario: '14h30', titulo: 'Reunião MROSC Museus Centro', formato: '', tipo: 'reunião' },
  { data: '2026-06-11', horario: '10h às 11h', titulo: 'Reunião Virtual Centros Culturais', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-06-11', horario: '14h às 15h', titulo: 'Visita Técnica – Iluminação MHAB', formato: 'Presencial', local: 'MHAB', tipo: 'visita técnica' },
  { data: '2026-06-11', horario: '15h30 às 16h', titulo: 'Visita Técnica – Iluminação MHAB (2ª visita)', formato: 'Presencial', local: 'MHAB', tipo: 'visita técnica' },
  { data: '2026-06-11', horario: '16h30 às 17h30', titulo: 'Visita Técnica – Programação/Iluminação MUMO', formato: 'Presencial', local: 'MUMO', tipo: 'visita técnica' },
  { data: '2026-06-12', horario: '15h às 15h30', titulo: 'Reunião alinhamento – Cobertura Noturno', formato: '', tipo: 'alinhamento' },
  { data: '2026-06-15', horario: '14h às 15h', titulo: 'Reunião Produção – Museus Pampulha', formato: 'Virtual', tipo: 'reunião' },
  { data: '2026-06-16', horario: '14h às 14h30', titulo: 'Reunião Alinhamento Produção / VAR', formato: '', tipo: 'alinhamento' },
  { data: '2026-06-19', horario: '10h às 11h', titulo: 'Visita Técnica Programação Casa do Baile / Capivarã', formato: 'Presencial', local: 'Casa do Baile', tipo: 'visita técnica' },
  { data: '2026-06-23', horario: '11h às 12h', titulo: 'Visita Técnica Programação MCK', formato: 'Presencial', local: 'MCK', tipo: 'visita técnica' },
  { data: '2026-06-24', horario: '10h às 11h30', titulo: 'Reunião Geral – Produção/VAR', formato: '', tipo: 'reunião' },
  { data: '2026-06-24', horario: '10h30 às 11h30', titulo: 'Reunião BHTrans', formato: '', tipo: 'reunião' },
  { data: '2026-06-24', horario: '14h30', titulo: 'Reunião MROSC Museus Centro', formato: '', tipo: 'reunião' },
];

const ATIVIDADES_CULTURAIS = [
  // AQUÁRIO
  { num: 1, titulo: 'Mini Exposição "Peixe é Tudo Igual?"', instituicao: 'Aquário do Rio São Francisco (Fundação de Parques Municipais e Zoobotânica)', endereco: 'Av. Antônio Francisco Lisboa, 450 - Bandeirantes', horario: '18h às 21h30', classificacao: 'livre', vagas: 'grupos de 20 pessoas', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 12 },
  { num: 2, titulo: 'Exibição do Vídeo "O Aquário do Rio São Francisco"', instituicao: 'Aquário do Rio São Francisco', endereco: 'Av. Antônio Francisco Lisboa, 450 - Bandeirantes', horario: '18h às 21h30', classificacao: 'livre', vagas: '100 vagas por exibição', inscricao: 'Não necessário', gratuita: true, tipo: 'exibição de filme', pagina_pdf: 12 },
  { num: 3, titulo: 'Visita Guiada aos Bastidores do Aquário', instituicao: 'Aquário do Rio São Francisco', endereco: 'Av. Antônio Francisco Lisboa, 450 - Bandeirantes', horario: '19h às 21h30', classificacao: '6+', vagas: 'grupos de 15 pessoas', inscricao: 'No local em frente ao auditório', gratuita: true, tipo: 'visita mediada', pagina_pdf: 12 },
  { num: 4, titulo: 'Apresentação Didática de Alimentação dos Peixes com Enriquecimento Ambiental', instituicao: 'Aquário do Rio São Francisco', endereco: 'Av. Antônio Francisco Lisboa, 450 - Bandeirantes', horario: '19h30 às 20h30', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 13 },
  // CÂMARASETE
  { num: 5, titulo: 'Exposição Mundo ≡ Floresta', instituicao: 'CâmaraSete – Casa da Fotografia de Minas Gerais', endereco: 'Av. Afonso Pena, 737 - Centro', horario: '18h às 21h', classificacao: 'livre', vagas: 'livre com controle de fluxo', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 13 },
  // CASA DO BAILE
  { num: 6, titulo: 'Pampulha Sonora – Passeio de Barco ao Pôr do Sol', instituicao: 'Casa do Baile', endereco: 'Av. Otacílio Negrão de Lima, 751 - Pampulha', horario: '16h30 às 17h30', classificacao: 'livre', vagas: 'livre', inscricao: 'Retirada de ingressos 30 min antes', gratuita: true, tipo: 'show', pagina_pdf: 14, museu: 'Casa do Baile' },
  { num: 7, titulo: 'Visita à Exposição "Trans:Paisagem" de Leonardo Finotti', instituicao: 'Casa do Baile', endereco: 'Av. Otacílio Negrão de Lima, 751 - Pampulha', horario: 'até as 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 14, museu: 'Casa do Baile' },
  { num: 8, titulo: 'Solenidade de Abertura da 11ª Edição do Noturno nos Museus e Apresentação do Coral "Bora Cantar! Diversidade"', instituicao: 'Casa do Baile', endereco: 'Av. Otacílio Negrão de Lima, 751 - Pampulha', horario: '18h às 19h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'apresentação musical', pagina_pdf: 15, museu: 'Casa do Baile' },
  { num: 9, titulo: 'Lindo Baile do Amor – Rueda de Cumbia com Atípica de Lhamas', instituicao: 'Casa do Baile', endereco: 'Av. Otacílio Negrão de Lima, 751 - Pampulha', horario: '20h30 às 22h30', classificacao: 'livre', vagas: 'sujeito a lotação', inscricao: 'Não necessário', gratuita: true, tipo: 'show', pagina_pdf: 15, museu: 'Casa do Baile' },
  // CASA FIAT
  { num: 10, titulo: 'Oficina de Colagem com Plantas | Jardins Invertidos: Arte, Natureza e Imaginação', instituicao: 'Casa Fiat de Cultura', endereco: 'Praça da Liberdade, 10 - Funcionários', horario: '19h às 20h | 20h às 21h', classificacao: 'livre', vagas: '30 vagas por oficina', inscricao: 'Senhas na recepção por ordem de chegada', gratuita: true, tipo: 'oficina', pagina_pdf: 15 },
  { num: 11, titulo: 'Exposição "Reflorestar: Quando Permito Florescer" na Piccola Galleria', instituicao: 'Casa Fiat de Cultura', endereco: 'Praça da Liberdade, 10 - Funcionários', horario: '18h às 21h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 16 },
  // CASA ROSADA
  { num: 12, titulo: 'Exposição "Habitar o /in/visível – Coabitar a Cidade"', instituicao: 'Casa Rosada Gasmig Minas', endereco: 'Rua da Bahia, 2425 - Lourdes', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 17 },
  { num: 13, titulo: 'Roda de Conversa Rastros de Memória', instituicao: 'Casa Rosada Gasmig Minas', endereco: 'Rua da Bahia, 2425 - Lourdes', horario: '18h | 19h | 20h | 21h | 22h', classificacao: 'livre', vagas: 'até 25 pessoas por hora', inscricao: 'Não necessário', gratuita: true, tipo: 'roda de conversa', pagina_pdf: 17 },
  // CCBB
  { num: 14, titulo: 'Exposição de Longa Duração – CCBB BH', instituicao: 'Centro Cultural Banco do Brasil Belo Horizonte', endereco: 'Praça da Liberdade, 450 - Savassi', horario: '18h às 22h', classificacao: 'livre', vagas: 'sujeito à lotação', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 17 },
  { num: 15, titulo: 'Causos do Ocaso: Visita Encenada', instituicao: 'Centro Cultural Banco do Brasil Belo Horizonte', endereco: 'Praça da Liberdade, 450 - Savassi', horario: '19h - 1ª sessão | 20h - 2ª sessão', classificacao: 'livre', vagas: 'sujeito à lotação', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 18 },
  { num: 16, titulo: 'Práticas de Ateliê', instituicao: 'Centro Cultural Banco do Brasil Belo Horizonte', endereco: 'Praça da Liberdade, 450 - Savassi', horario: '18h às 19h', classificacao: 'livre', vagas: '15 pessoas', inscricao: 'Retirada de ingresso na bilheteria', gratuita: true, tipo: 'oficina', pagina_pdf: 18 },
  // CENTRO CIÊNCIAS MÉDICAS
  { num: 17, titulo: 'Exposição – Centro de Memória Ciências Médicas-MG', instituicao: 'Centro de Memória Ciências Médicas-MG', endereco: 'Alameda Ezequiel Dias, 275 - Centro', horario: '18h às 22h', classificacao: 'livre', vagas: '–', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 18 },
  { num: 18, titulo: 'Visitas Mediadas – Ciências Médicas-MG', instituicao: 'Centro de Memória Ciências Médicas-MG', endereco: 'Alameda Ezequiel Dias, 275 - Centro', horario: '18h às 22h', classificacao: 'livre', vagas: '–', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 19 },
  // JUSTIÇA ELEITORAL
  { num: 19, titulo: 'Exposição – Centro de Memória da Justiça Eleitoral de MG', instituicao: 'Centro de Memória da Justiça Eleitoral de Minas Gerais', endereco: 'Av. Prudente de Morais, 320 - 1º andar - Cidade Jardim', horario: '18h às 22h', classificacao: 'livre', vagas: '–', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 19 },
  // SANTA CASA
  { num: 20, titulo: 'Visita Teatralizada – Santa Casa BH', instituicao: 'Centro de Memória Manoel Hygino dos Santos - Santa Casa BH', endereco: 'Rua Álvares Maciel, 611. Santa Efigênia', horario: '18h30 | 19h30 | 20h30', classificacao: 'livre', vagas: '15 vagas por apresentação', inscricao: 'Por ordem de chegada', gratuita: true, tipo: 'visita mediada', pagina_pdf: 20 },
  { num: 21, titulo: 'Apresentação Artística – Santa Casa BH', instituicao: 'Centro de Memória Manoel Hygino dos Santos - Santa Casa BH', endereco: 'Rua Álvares Maciel, 611. Santa Efigênia', horario: '21h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'apresentação musical', pagina_pdf: 20 },
  { num: 22, titulo: 'Exposição Santa Casa BH', instituicao: 'Centro de Memória Manoel Hygino dos Santos - Santa Casa BH', endereco: 'Rua Álvares Maciel, 611. Santa Efigênia', horario: '18h às 22h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 20 },
  // MINAS TÊNIS CLUBE
  { num: 23, titulo: 'Visitas Mediadas à Exposição "Várias Histórias"', instituicao: 'Centro de Memória Minas Tênis Clube', endereco: 'Rua da Bahia, 2244 - 5º andar - Lourdes', horario: '18h às 22h', classificacao: 'livre', vagas: '30 vagas por visita', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 21 },
  // CRCP LAGOA DO NADO
  { num: 24, titulo: 'Exposição "Jogo da Liberdade – A Capoeira em Belo Horizonte, Anos 60, 70 e 80"', instituicao: 'Centro de Referência da Cultura Popular e Tradicional Lagoa do Nado (CRCP)', endereco: 'Rua Ministro Hermenegildo de Barros, 904 - Itapoã', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 21 },
  { num: 25, titulo: 'Lançamento do Livro "Tesouros da Capoeira" + Performance Poética', instituicao: 'Centro de Referência da Cultura Popular e Tradicional Lagoa do Nado (CRCP)', endereco: 'Rua Ministro Hermenegildo de Barros, 904 - Itapoã', horario: '19h', classificacao: 'livre', vagas: '–', inscricao: 'Não necessário', gratuita: true, tipo: 'lançamento de livro', pagina_pdf: 22 },
  { num: 26, titulo: 'Lançamento do Livro "Escrevivências de Amanda Veiga..."', instituicao: 'Centro de Referência da Cultura Popular e Tradicional Lagoa do Nado (CRCP)', endereco: 'Rua Ministro Hermenegildo de Barros, 904 - Itapoã', horario: '20h', classificacao: 'livre', vagas: '–', inscricao: 'Não necessário', gratuita: true, tipo: 'lançamento de livro', pagina_pdf: 22 },
  { num: 27, titulo: 'Sarau "Ao Léu" da Cultura Popular', instituicao: 'Centro de Referência da Cultura Popular e Tradicional Lagoa do Nado (CRCP)', endereco: 'Rua Ministro Hermenegildo de Barros, 904 - Itapoã', horario: '19h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'sarau', pagina_pdf: 22 },
  { num: 28, titulo: 'Visita Mediada à Exposição: Jogo da Liberdade – A Capoeira em BH, Anos 60, 70 e 80', instituicao: 'Centro de Referência da Cultura Popular e Tradicional Lagoa do Nado (CRCP)', endereco: 'Rua Ministro Hermenegildo de Barros, 904 - Itapoã', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 23 },
  { num: 29, titulo: 'Instalação Fogo Fátuo – Ocupação Gráfica', instituicao: 'Centro de Referência da Cultura Popular e Tradicional Lagoa do Nado (CRCP)', endereco: 'Rua Ministro Hermenegildo de Barros, 904 - Itapoã', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'instalação', pagina_pdf: 23 },
  // ESPAÇO COMUM LUIZ ESTRELA
  { num: 30, titulo: 'Abertura da Exposição – Constelações: Experimentos e Partilhas em Torno de um Museu Estelar', instituicao: 'Espaço Comum Luiz Estrela', endereco: 'Rua Manaus, 348, São Lucas', horario: '19h30 às 22h30', classificacao: 'livre', vagas: '80 vagas', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 23 },
  // MUSEU DA FORÇA EXPEDICIONÁRIA
  { num: 31, titulo: 'Exposição do Acervo – Museu da Força Expedicionária Brasileira', instituicao: 'Espaço Cultural da 4ª Região Militar - Museu da Força Expedicionária Brasileira de BH', endereco: 'Rua Tupis, 723, Centro', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 24 },
  { num: 32, titulo: 'Visitas Guiadas – Museu da Força Expedicionária Brasileira', instituicao: 'Espaço Cultural da 4ª Região Militar - Museu da Força Expedicionária Brasileira de BH', endereco: 'Rua Tupis, 723, Centro', horario: 'a partir de 19h (de 30 em 30 min)', classificacao: 'livre', vagas: '15 vagas por visita', inscricao: 'via telefone / whatsapp', gratuita: true, tipo: 'visita mediada', pagina_pdf: 24 },
  { num: 33, titulo: 'Palestras e Exibição de Documentários – Força Expedicionária', instituicao: 'Espaço Cultural da 4ª Região Militar - Museu da Força Expedicionária Brasileira de BH', endereco: 'Rua Tupis, 723, Centro', horario: 'a partir de 18h (de 30 em 30 min)', classificacao: 'livre', vagas: '30 vagas por turma', inscricao: 'Não necessário', gratuita: true, tipo: 'palestra', pagina_pdf: 24 },
  // ESCOLA DE DESIGN UEMG
  { num: 34, titulo: 'Auto.grafia', instituicao: 'Espaço Cultural da Escola de Design UEMG', endereco: 'Rua Gonçalves Dias, 1.434 - Lourdes', horario: '19h às 21h', classificacao: 'livre', vagas: '–', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 25 },
  // ESPAÇO DO CONHECIMENTO UFMG
  { num: 35, titulo: 'Exposição Demasiado Humano', instituicao: 'Espaço do Conhecimento UFMG', endereco: 'Praça da Liberdade, 700, Funcionários', horario: '18h às 21h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 25 },
  { num: 36, titulo: 'Sessões de Planetário', instituicao: 'Espaço do Conhecimento UFMG', endereco: 'Praça da Liberdade, 700, Funcionários', horario: '18h | 19h | 20h', classificacao: 'livre', vagas: '60 vagas por sessão', inscricao: 'Bilhetes na recepção 1h antes', gratuita: true, tipo: 'sessão de planetário', pagina_pdf: 26 },
  { num: 37, titulo: 'Observações Astronômicas', instituicao: 'Espaço do Conhecimento UFMG', endereco: 'Praça da Liberdade, 700, Funcionários', horario: '19h às 20h45 (grupos a cada 15 min)', classificacao: 'a partir de 06 anos', vagas: '17 vagas por grupo', inscricao: 'Bilhetes na recepção', gratuita: true, tipo: 'observação astronômica', pagina_pdf: 26 },
  // ESTAÇÃO ECOLÓGICA UFMG
  { num: 38, titulo: 'As Fachadas do Lar dos Meninos, na Estação Ecológica-UFMG', instituicao: 'Estação Ecológica Universidade Federal de Minas Gerais', endereco: 'Avenida Antônio Carlos, 6627 - Pampulha', horario: '18h | 19h | 20h', classificacao: 'livre', vagas: '20 vagas por oficina', inscricao: 'Não necessário', gratuita: true, tipo: 'oficina', pagina_pdf: 27 },
  { num: 39, titulo: 'Corpo, Mata e Cidade: Uma Experiência Sensorial em Trilha Noturna', instituicao: 'Estação Ecológica Universidade Federal de Minas Gerais', endereco: 'Avenida Antônio Carlos, 6627 - Pampulha', horario: '18h30 às 19h30 | 19h30 às 20h30', classificacao: 'livre', vagas: '40 vagas por turma', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 27 },
  { num: 40, titulo: 'Oficina O Que os Animais Deixam pelo Caminho', instituicao: 'Estação Ecológica Universidade Federal de Minas Gerais', endereco: 'Avenida Antônio Carlos, 6627 - Pampulha', horario: '18h30 às 19h30 | 19h30 às 20h30', classificacao: 'livre', vagas: '30 vagas por oficina', inscricao: 'Não necessário', gratuita: true, tipo: 'oficina', pagina_pdf: 27 },
  // GALERIA UNIMED
  { num: 41, titulo: 'Exposição: Oposto Complementar do Infinito do Artista Guilherme Cunha', instituicao: 'Galeria de Arte Centro Cultural Unimed-BH Minas', endereco: 'Rua da Bahia, 2244, Lourdes', horario: '18h às 23h', classificacao: 'livre', vagas: '25 vagas por visita mediada', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 28 },
  // INSTITUTO UNDIÓ
  { num: 42, titulo: 'Abertura da Exposição: Ondas de Artes', instituicao: 'Instituto Undió', endereco: 'Rua Padre Belchior, 280 - Centro', horario: '15h às 19h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 28 },
  { num: 43, titulo: 'Mesa de Thereza', instituicao: 'Instituto Undió', endereco: 'Rua Padre Belchior, 280 - Centro', horario: '18h às 21h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'performance', pagina_pdf: 29 },
  { num: 44, titulo: 'Feira de Estudantes de Arte', instituicao: 'Instituto Undió', endereco: 'Rua Padre Belchior, 280 - Centro', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 29 },
  // MEMORIAL LEGISLATIVO
  { num: 45, titulo: 'Visita Memória e Cultural – Memorial do Legislativo Mineiro', instituicao: 'Memorial do Legislativo Mineiro', endereco: 'Rua Rodrigues Caldas, 79 - Santo Agostinho', horario: '18h às 21h', classificacao: 'a partir de 10 anos', vagas: 'até 40 visitantes por grupo', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 30 },
  // MEMORIAL DIREITOS HUMANOS
  { num: 46, titulo: 'Visita Mediada ao Memorial dos Direitos Humanos', instituicao: 'Memorial dos Direitos Humanos', endereco: 'Avenida Afonso Pena, 2351, Funcionários', horario: '18h / 20h / 22h', classificacao: '12 anos', vagas: '40 vagas', inscricao: 'Formulário online', gratuita: true, tipo: 'visita mediada', pagina_pdf: 30 },
  { num: 47, titulo: "Visita à Exposição 'Tudo que Não Explode Range'", instituicao: 'Memorial dos Direitos Humanos', endereco: 'Avenida Afonso Pena, 2351, Funcionários', horario: '18h / 20h / 22h', classificacao: '14 anos', vagas: '50 vagas', inscricao: 'Formulário online', gratuita: true, tipo: 'exposição', pagina_pdf: 31 },
  // MM GERDAU
  { num: 48, titulo: 'Exposição: Coleções com Memória – A Memória Geológica Construída por Quem Coleciona', instituicao: 'MM Gerdau – Museu das Minas e do Metal', endereco: 'Praça da Liberdade, 680 - Funcionários (Prédio Rosa)', horario: '18h às 22h', classificacao: '–', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 31 },
  { num: 49, titulo: 'Visita Espontânea no MM Gerdau – Museu das Minas e do Metal', instituicao: 'MM Gerdau – Museu das Minas e do Metal', endereco: 'Praça da Liberdade, 680 - Funcionários (Prédio Rosa)', horario: '18h às 22h', classificacao: '–', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 32 },
  // MUSEU BRASILEIRO DO FUTEBOL
  { num: 50, titulo: 'Visita ao Museu Brasileiro do Futebol', instituicao: 'Museu Brasileiro do Futebol', endereco: 'Av. Coronel Oscar Paschoal, s/n - Pampulha', horario: '18h às 22h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 32 },
  // MUSEU CASA KUBITSCHEK
  { num: 51, titulo: 'Exposição "Vivências na Pampulha"', instituicao: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4.188 - Bandeirantes', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 32, museu: 'Casa Kubitschek' },
  { num: 52, titulo: 'Exposição "Traçar Moderno: Construindo Formas e Trajetórias"', instituicao: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4.188 - Bandeirantes', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 33, museu: 'Casa Kubitschek' },
  { num: 53, titulo: 'Mostra "Retratos de uma Era – As Fotos Raras de JK"', instituicao: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4.188 - Bandeirantes', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 33, museu: 'Casa Kubitschek' },
  { num: 54, titulo: 'Praça de Colagem – Um Portal, Mil Oportunidades – Presenças Negras na Pampulha com Lara de Paula', instituicao: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4.188 - Bandeirantes', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'oficina', pagina_pdf: 34, museu: 'Casa Kubitschek' },
  { num: 55, titulo: 'Oficina de Pandeiro e Musicalização Corporal com Alexandre Santos', instituicao: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4.188 - Bandeirantes', horario: '19h às 20h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'oficina', pagina_pdf: 34, museu: 'Casa Kubitschek' },
  { num: 56, titulo: 'Roda de Samba com a Velha Guarda do Samba de BH', instituicao: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4.188 - Bandeirantes', horario: '20h30', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'show', pagina_pdf: 34, museu: 'Casa Kubitschek' },
  // MUSEU DA ESCOLA DE ARQUITETURA
  { num: 57, titulo: 'Visita Guiada ao Acervo – MARQ', instituicao: 'Museu da Escola de Arquitetura - MARQ', endereco: 'Rua Paraíba, 697, Funcionários', horario: '18h30 | 19h30 | 20h30', classificacao: '12 a 120 anos', vagas: 'grupos de no máximo 20 pessoas', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 35 },
  // MIS
  { num: 58, titulo: 'Exposição "Do Traço ao Pixel"', instituicao: 'Museu da Imagem e do Som de Belo Horizonte', endereco: 'Avenida Álvares Cabral, 560 - Lourdes', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 35, museu: 'MIS' },
  { num: 59, titulo: 'DJ Camis', instituicao: 'Museu da Imagem e do Som de Belo Horizonte', endereco: 'Avenida Álvares Cabral, 560 - Lourdes', horario: '18h às 20h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'show', pagina_pdf: 36, museu: 'MIS' },
  { num: 60, titulo: 'Show "Tributo a Lô Borges – Tudo que Você Podia Ser" – Rodrigo Borges e Marilton Borges', instituicao: 'Museu da Imagem e do Som de Belo Horizonte', endereco: 'Avenida Álvares Cabral, 560 - Lourdes', horario: '20h às 22h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'show', pagina_pdf: 36, museu: 'MIS' },
  // MUSEU DA MATEMÁTICA UFMG
  { num: 61, titulo: 'Visita Mediada ao Museu da Matemática UFMG', instituicao: 'Museu da Matemática UFMG', endereco: 'UFMG - ICEx sala 4010 - Av. Pres. Antônio Carlos, 6627 - Pampulha', horario: '18h às 21h / a cada 45 minutos', classificacao: 'a partir de 12 anos', vagas: '50 por horário', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 36 },
  { num: 62, titulo: 'Oficina: Quando a Matemática Encontra a Arte', instituicao: 'Museu da Matemática UFMG', endereco: 'UFMG - ICEx sala 4010 - Av. Pres. Antônio Carlos, 6627 - Pampulha', horario: '18h às 21h a cada 30 minutos', classificacao: 'a partir de 12 anos', vagas: 'a partir de 12 anos', inscricao: 'Não necessário', gratuita: true, tipo: 'oficina', pagina_pdf: 37 },
  // MUMO
  { num: 63, titulo: 'Exposição "Clara Nunes – Eu Sou a Tal Mineira"', instituicao: 'Museu da Moda de Belo Horizonte (MUMO)', endereco: 'Rua da Bahia, 2249 - Centro', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 37, museu: 'MUMO' },
  { num: 64, titulo: 'Oficina Rotativa: Colares de Mandalas', instituicao: 'Museu da Moda de Belo Horizonte (MUMO)', endereco: 'Rua da Bahia, 2249 - Centro', horario: '18h às 22h (20 min por oficina)', classificacao: 'livre', vagas: '100 vagas rotativas', inscricao: 'Senhas ao longo do evento', gratuita: true, tipo: 'oficina', pagina_pdf: 38, museu: 'MUMO' },
  { num: 65, titulo: 'DJs do Coletivo OHM Jazzy', instituicao: 'Museu da Moda de Belo Horizonte (MUMO)', endereco: 'Rua da Bahia, 2249 - Centro', horario: '18h às 23h', classificacao: 'livre', vagas: 'vagas rotativas', inscricao: 'Não necessário', gratuita: true, tipo: 'show', pagina_pdf: 38, museu: 'MUMO' },
  { num: 66, titulo: 'Visita Mediada à Exposição "Clara Nunes – Eu Sou a Tal Mineira"', instituicao: 'Museu da Moda de Belo Horizonte (MUMO)', endereco: 'Rua da Bahia, 2249 - Centro', horario: '18h30', classificacao: 'livre', vagas: '20 vagas', inscricao: 'Senhas a partir de 18h', gratuita: true, tipo: 'visita mediada', pagina_pdf: 38, museu: 'MUMO' },
  { num: 67, titulo: 'Favelinha Fashion Week – Desfile "BH é o Texas", MCs e Roda de Conversa', instituicao: 'Museu da Moda de Belo Horizonte (MUMO)', endereco: 'Rua da Bahia, 2249 - Centro', horario: '19h30 às 21h15', classificacao: 'livre', vagas: '70 vagas', inscricao: 'Senhas a partir das 18h', gratuita: true, tipo: 'performance', pagina_pdf: 38, museu: 'MUMO' },
  { num: 68, titulo: 'Exibição do Filme "Nevou" e Bate-papo com o Diretor Kdu dos Anjos', instituicao: 'Museu da Moda de Belo Horizonte (MUMO)', endereco: 'Rua da Bahia, 2249 - Centro', horario: '21h30', classificacao: 'livre', vagas: '70 vagas', inscricao: 'Senhas a partir de 19h15', gratuita: true, tipo: 'exibição de filme', pagina_pdf: 39, museu: 'MUMO' },
  // MAP
  { num: 69, titulo: 'Instalação Audiovisual "Fechado/Aberto" com Polvo Studio + Ativação Sonora com Sanara Rocha, Letrícia, Glau, Rafael RG e DJ ABU', instituicao: 'Museu de Arte da Pampulha (MAP)', endereco: 'Av. Otacílio Negrão de Lima, 16.585 - Pampulha', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'instalação', pagina_pdf: 40, museu: 'MAP' },
  // MUSEU CIÊNCIAS NATURAIS PUC
  { num: 71, titulo: 'Visita Mediada pelo Museu PUC Minas', instituicao: 'Museu de Ciências Naturais PUC Minas', endereco: 'Avenida Dom José Gaspar, 290 - Coração Eucarístico - PUC Minas', horario: '18h às 22h', classificacao: 'livre', vagas: 'ilimitado', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 41 },
  { num: 72, titulo: 'Sessão do Planetário – Museu PUC Minas', instituicao: 'Museu de Ciências Naturais PUC Minas', endereco: 'Avenida Dom José Gaspar, 290 - Coração Eucarístico - PUC Minas', horario: '20h', classificacao: 'livre', vagas: '70 vagas', inscricao: 'Bilhetes na bilheteria no dia', gratuita: true, tipo: 'sessão de planetário', pagina_pdf: 41 },
  { num: 73, titulo: 'Observação dos Corpos Celestes com o GAIA', instituicao: 'Museu de Ciências Naturais PUC Minas', endereco: 'Avenida Dom José Gaspar, 290 - Coração Eucarístico - PUC Minas', horario: '18h às 22h', classificacao: 'livre', vagas: 'ilimitado', inscricao: 'Não necessário', gratuita: true, tipo: 'observação astronômica', pagina_pdf: 41 },
  // MHAB
  { num: 74, titulo: 'Peça em Destaque – Contraplanos: A Força Comunitária da Autoconstrução em BH', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 42, museu: 'MHAB' },
  { num: 75, titulo: 'Exposição Belo Horizonte Fora dos Planos', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 42, museu: 'MHAB' },
  { num: 76, titulo: 'Exposição Travessias do Curral Del Rei', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 42, museu: 'MHAB' },
  { num: 77, titulo: 'Exposição "Beagá Decô e Gráfica: Do Papel à Cidade do Papel" da Artista Fernanda Goulart', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '18h às 23h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 43, museu: 'MHAB' },
  { num: 78, titulo: 'Contação da História Musicada "A Festa no Céu" de Carlos Braga – Braguinha, acompanhada de Canções Juninas', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '18h30', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'contação de história', pagina_pdf: 43, museu: 'MHAB' },
  { num: 79, titulo: 'Visita Mediada à Exposição "Belo Horizonte Fora dos Planos"', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '19h | 20h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 43, museu: 'MHAB' },
  { num: 80, titulo: 'Visita Mediada à Exposição "Travessias do Curral Del Rei"', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '19h | 20h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 43, museu: 'MHAB' },
  { num: 81, titulo: 'Show "Sabor Tropical Tradicional"', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '19h30', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'show', pagina_pdf: 44, museu: 'MHAB' },
  { num: 82, titulo: 'Bailinho no MHAB com DJ Rodrigo Rocha', instituicao: 'Museu Histórico Abílio Barreto (MHAB)', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim', horario: '21h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'show', pagina_pdf: 44, museu: 'MHAB' },
  // MUSEU INIMÁ DE PAULA
  { num: 83, titulo: '2ª Edição da Mostra Memórias Cine Guarani', instituicao: 'Museu Inimá de Paula', endereco: 'Rua da Bahia, 1201 - Centro', horario: '17h às 22h', classificacao: '–', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exibição de filme', pagina_pdf: 44 },
  // MUSEU MINEIRO
  { num: 84, titulo: 'Visita Mediada à Exposição "Minas das Artes, Histórias Gerais"', instituicao: 'Museu Mineiro', endereco: 'Av. João Pinheiro, 342 - Funcionários', horario: '19h às 21h', classificacao: 'livre', vagas: '25 vagas', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 45 },
  // PALÁCIO DAS ARTES
  { num: 85, titulo: 'Exposição: Acervo Palácio das Artes "Seria uma Rima, Não uma Solução"', instituicao: 'Palácio das Artes', endereco: 'Av. Afonso Pena, 1537 - Centro', horario: '18h às 21h', classificacao: 'livre', vagas: 'livres com controle de fluxo', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 45 },
  { num: 86, titulo: 'Chama Permanências: Revisitar Passados para Construir Futuros – 17ª Mostra da Escola de Artes Visuais do Cefart/FCS', instituicao: 'Palácio das Artes', endereco: 'Av. Afonso Pena, 1537 - Centro', horario: '19h (abertura 26/06)', classificacao: 'livre', vagas: 'livres com controle de fluxo', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 46 },
  { num: 87, titulo: 'Exposição: 20 Mulheres de História', instituicao: 'Palácio das Artes', endereco: 'Av. Afonso Pena, 1537 - Centro', horario: '18h às 21h', classificacao: 'livre', vagas: 'livres com controle de fluxo', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 46 },
  // PONTO CULTURAL CDL
  { num: 88, titulo: 'O Comércio e a Cidade – Ponto Cultural CDL', instituicao: 'Ponto Cultural CDL', endereco: 'Av. João Pinheiro, 495 - Centro', horario: '19h', classificacao: 'livre', vagas: '25 pessoas', inscricao: 'Não necessária', gratuita: true, tipo: 'visita mediada', pagina_pdf: 47 },
  // SESI MAO
  { num: 89, titulo: 'Visita Mediada ao Acervo do SESI MAO', instituicao: 'SESI Museu de Artes e Ofícios', endereco: 'Praça Rui Barbosa nº 600 - Centro', horario: '18h às 21h', classificacao: 'livre', vagas: '25 vagas por sessão', inscricao: 'Não necessário', gratuita: true, tipo: 'visita mediada', pagina_pdf: 47 },
  { num: 90, titulo: 'Exposição Temporária: "Pretos Novos" – por Aziza', instituicao: 'SESI Museu de Artes e Ofícios', endereco: 'Praça Rui Barbosa nº 600 - Centro', horario: '18h às 21h', classificacao: 'livre', vagas: 'livre', inscricao: 'Não necessário', gratuita: true, tipo: 'exposição', pagina_pdf: 47 },
];

const FOTOS_PDF = [
  { titulo: 'Wind banner Noturno nos Museus 2026 – 1', secao: 'Registro Fotográfico – Sinalização Wind Banners', pagina_pdf: 7, legenda: 'Wind banner do Noturno nos Museus 2026 instalado em equipamento cultural participante. Local não identificado com exatidão no relatório.', local: 'Não identificado no relatório', data_aproximada: '2026-06-26', atividade: 'Sinalização Noturno 2026' },
  { titulo: 'Wind banner Noturno nos Museus 2026 – 2', secao: 'Registro Fotográfico – Sinalização Wind Banners', pagina_pdf: 7, legenda: 'Wind banner do Noturno nos Museus 2026 instalado em equipamento cultural participante (fachada com vidro). Local não identificado com exatidão no relatório.', local: 'Não identificado no relatório', data_aproximada: '2026-06-26', atividade: 'Sinalização Noturno 2026' },
  { titulo: 'Bandeirola Noturno nos Museus 2026 – laranja', secao: 'Registro Fotográfico – Bandeirolas', pagina_pdf: 7, legenda: 'Bandeirola laranja de sinalização do Noturno nos Museus 2026 utilizada na logística e identificação da 11ª edição.', local: 'Não identificado no relatório', data_aproximada: '2026-06-26', atividade: 'Sinalização Noturno 2026' },
  { titulo: 'Bandeirola Noturno nos Museus 2026 – azul', secao: 'Registro Fotográfico – Bandeirolas', pagina_pdf: 7, legenda: 'Bandeirola azul de sinalização do Noturno nos Museus 2026 utilizada na logística e identificação da 11ª edição.', local: 'Não identificado no relatório', data_aproximada: '2026-06-26', atividade: 'Sinalização Noturno 2026' },
];

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

export default function ImportarRelatorioNoturno({ onClose, onConcluido }) {
  const [etapa, setEtapa] = useState('revisao'); // revisao | importando | concluido | erro
  const [progresso, setProgresso] = useState(0);
  const [progressoMsg, setProgressoMsg] = useState('');
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [expandedSection, setExpandedSection] = useState('resumo');
  const [checkboxes, setCheckboxes] = useState({ importarAgenda: true, importarAtividades: true, importarFotos: true, importarRelatorio: true });

  const toggleSection = (s) => setExpandedSection(expandedSection === s ? null : s);

  const executarImportacao = useCallback(async () => {
    setEtapa('importando');
    setProgresso(0);
    const log = { atividades_identificadas: 0, atividades_criadas: 0, registros_reutilizados: 0, fotos_extraidas: 0, fotos_vinculadas: 0, fotos_ignoradas: 0, divergencias: [], erros: [], campos_pendentes: [] };

    try {
      // ETAPA 1: DocumentIntake
      setProgressoMsg('Registrando documento-fonte…'); setProgresso(5);
      const intake = await base44.asServiceRole.entities.DocumentIntake.create({
        user_email: 'dani.isis@viadutodas artes.org.br',
        user_name: 'Dani Isis',
        tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
        status_processamento: 'AGUARDANDO_REVISAO',
        arquivo_original_url: PDF_URL,
        file_name_original: 'Relatório Parcial de Produção - 11ª Edição Noturno nos Museus - 2026.pdf',
        mime_type: 'application/pdf',
        entidade_destino: 'Activity',
        resultado_ia: {
          titulo: 'Relatório Parcial de Produção — 11ª Edição Noturno nos Museus — 2026',
          categoria: 'Noturno nos Museus 2026',
          periodo_inicial: '2026-05-01',
          periodo_final: '2026-07-31',
          data_evento: '2026-06-26',
          paginas: 59,
          total_instituicoes: 35,
          total_atividades_programadas: 90,
          total_centros_culturais: 16,
          publico_centros_culturais: 655,
          publico_estimado_museus: 1659,
          origem_importacao: 'manual',
          importado_em: new Date().toISOString(),
        },
        revisado_pelo_usuario: false,
        ocultar_entrada_unica: false,
      });

      // ETAPA 2: Report principal
      setProgressoMsg('Criando relatório principal…'); setProgresso(15);
      let reportId = null;
      if (checkboxes.importarRelatorio) {
        const report = await base44.asServiceRole.entities.Report.create({
          author_name: 'Dani Isis',
          author_role: 'PROFISSIONAL',
          funcao: 'Produção',
          museu: 'Noturno nos Museus',
          equipe: 'PRODUCAO',
          mes_referencia: 'Junho',
          ano: 2026,
          tipo: 'parcial',
          status: 'DRAFT',
          resumo_periodo: 'Relatório Parcial de Produção — 11ª Edição Noturno nos Museus — 2026. Período: maio a julho de 2026. Data do evento: 26/06/2026.',
          resumo_executivo: 'A 11ª edição do Noturno nos Museus, realizada em 26 de junho de 2026, articulou 35 instituições e uma programação de 90 atividades. A operação contemplou produção técnica, sinalização, transporte, circulação de Centros Culturais e programação cultural diversificada.',
          comentarios_gerais: 'Importado a partir do Relatório Parcial de Produção — PDF de 59 páginas. Todos os dados de público são ESTIMADOS, conforme apontado no documento-fonte. Divergência financeira registrada no serviço de vans: total calculado R$ 33.600,00 vs. valor informado R$ 33.400,00 (diferença de R$ 200,00 — revisão financeira obrigatória).',
          publico_geral_declarado: 1659,
          fotos: [],
          atividades: [],
          oportunidades: [],
          drive_backup_status: 'pendente',
        });
        reportId = report.id;
        log.relatorio_criado = reportId;
      }

      // ETAPA 3: Atividade – Agenda de Reuniões
      setProgressoMsg('Importando agenda de reuniões e visitas técnicas…'); setProgresso(25);
      let atividadeAgendaId = null;
      if (checkboxes.importarAgenda) {
        const atv = await base44.asServiceRole.entities.Activity.create({
          report_id: reportId,
          titulo: 'Agenda de Atividades – Reuniões e Visitas Técnicas (Noturno 2026)',
          descricao: `Registro das ${AGENDA_REUNIOES.length} reuniões e visitas técnicas realizadas no período de 29/04/2026 a 24/06/2026 para a produção da 11ª Edição do Noturno nos Museus.\n\n` + AGENDA_REUNIOES.map(r => `${r.data} ${r.horario ? '– ' + r.horario : ''} — ${r.titulo} (${r.formato || r.local || ''})`).join('\n'),
          data_inicio: '2026-04-29',
          data_fim: '2026-06-24',
          data_realizacao: '2026-06-24',
          classificacao: 'ROTINA',
          tipo_equipe: 'PRODUCAO',
          equipe_responsavel: 'Dani Isis',
          observacoes: `Fonte: Relatório Parcial de Produção — Noturno 2026 (PDF pág. 1). Total de ${AGENDA_REUNIOES.length} entradas documentadas.`,
          quantidade_produtos: AGENDA_REUNIOES.length,
          produtos_entregues: ['Reunião', 'Planejamento'],
          publico_estimado: 0,
          quantas_repeticoes: AGENDA_REUNIOES.length,
          publico_total: 0,
        });
        atividadeAgendaId = atv.id;
        log.atividades_criadas++;
      }

      // ETAPA 4: Atividade – Articulação Institucional
      setProgressoMsg('Importando articulação institucional…'); setProgresso(35);
      if (checkboxes.importarAtividades) {
        await base44.asServiceRole.entities.Activity.create({
          report_id: reportId,
          titulo: 'Articulação com Instituições e Programação Noturno nos Museus 2026',
          descricao: 'Ação realizada em articulação com a Diretoria de Museus. Atividades: listagem das instituições inscritas; levantamento, consolidação e revisão da programação completa; articulação junto às instituições; comunicados às instituições participantes (informe autorização de cobertura Viaduto das Artes; informe de visitação dos Centros Culturais – DMUS). Resultado: 35 instituições participantes, 90 atividades programadas.',
          data_inicio: '2026-05-01',
          data_fim: '2026-06-26',
          data_realizacao: '2026-06-26',
          classificacao: 'ROTINA',
          tipo_equipe: 'PRODUCAO',
          equipe_responsavel: 'Dani Isis',
          resultado_alcancado: '35 instituições participantes. 90 atividades programadas.',
          meta_quantitativa: '35 instituições / 90 atividades',
          status_meta: 'Cumprida',
          observacoes: 'Fonte: Relatório Parcial de Produção — Noturno 2026 (PDF pág. 2). Dados confirmados no documento.',
          publico_estimado: 0, publico_total: 0, quantas_repeticoes: 1,
        });
        log.atividades_criadas++;
      }

      // ETAPA 5: Atividade – Centros Culturais
      setProgressoMsg('Importando articulação com Centros Culturais…'); setProgresso(42);
      if (checkboxes.importarAtividades) {
        await base44.asServiceRole.entities.Activity.create({
          report_id: reportId,
          titulo: 'Articulação e Logística de Visitação dos Centros Culturais – Noturno 2026',
          descricao: 'Atividades: levantamento dos CCs interessados; levantamento da demanda de público; logística de distribuição de veículos; reunião de orientação; definição de trajetos; e-mail de informe aos CCs; grupo de WhatsApp com referências; monitoramento via WhatsApp no evento.',
          data_inicio: '2026-05-01',
          data_fim: '2026-06-26',
          data_realizacao: '2026-06-26',
          classificacao: 'ROTINA',
          tipo_equipe: 'PRODUCAO',
          equipe_responsavel: 'Dani Isis',
          resultado_alcancado: '16 Centros Culturais participantes. Público aproximado: 655 pessoas (ESTIMADO).',
          meta_quantitativa: '16 Centros Culturais / 655 pessoas (estimado)',
          status_meta: 'Cumprida',
          publico_estimado: 655,
          publico_total: 655,
          quantas_repeticoes: 1,
          observacoes: 'NOTA: público de 655 pessoas é ESTIMADO, conforme relatório. Não importados: nomes, CPFs, RGs e telefones dos responsáveis pelos veículos (dado sensível). Fonte: PDF pág. 2-3.',
        });
        log.atividades_criadas++;
      }

      // ETAPA 6: Atividade – Sinalização
      setProgressoMsg('Importando atividade de sinalização…'); setProgresso(48);
      let atividadeSinalizacaoId = null;
      if (checkboxes.importarAtividades) {
        const sinal = await base44.asServiceRole.entities.Activity.create({
          report_id: reportId,
          titulo: 'Produção, Distribuição e Recolhimento da Sinalização do Noturno nos Museus 2026',
          descricao: 'Atividades: articulação com comunicação sobre especificações; orçamentação (windbanners, bandeirolas, crachás); visita técnica – testagem da base windbanner; encaminhamento para produção; retirada e contagem; agendamento com DMUS; distribuição e montagem para 34 equipamentos; coleta e guarda após o evento.',
          data_inicio: '2026-05-01',
          data_fim: '2026-06-26',
          data_realizacao: '2026-06-26',
          classificacao: 'ROTINA',
          tipo_equipe: 'PRODUCAO',
          equipe_responsavel: 'Dani Isis',
          resultado_alcancado: 'Sinalização distribuída para 34 museus e centros de referência participantes. Materiais: windbanners, bandeirolas, crachás.',
          meta_quantitativa: '34 equipamentos atendidos',
          status_meta: 'Cumprida',
          publico_estimado: 0, publico_total: 0, quantas_repeticoes: 1,
          observacoes: 'Fonte: PDF pág. 6. Fotos de evidência vinculadas (wind banners e bandeirolas).',
        });
        atividadeSinalizacaoId = sinal.id;
        log.atividades_criadas++;
      }

      // ETAPA 7: Atividade – Transporte
      setProgressoMsg('Importando atividade de transporte…'); setProgresso(53);
      if (checkboxes.importarAtividades) {
        await base44.asServiceRole.entities.Activity.create({
          report_id: reportId,
          titulo: 'Operação de Transporte e Circulação – Noturno nos Museus 2026',
          descricao: 'Atividades: orçamentação; alinhamento logístico; formalização da contratação; definição de quantidade de vans; definição da operação de monitoramento; solicitação de documentação para BHTrans; reuniões de alinhamento; definição dos trajetos; cronograma de circulação; abertura de grupo de monitores de vans; monitoramento no evento.',
          data_inicio: '2026-05-01',
          data_fim: '2026-06-26',
          data_realizacao: '2026-06-26',
          classificacao: 'ROTINA',
          tipo_equipe: 'PRODUCAO',
          equipe_responsavel: 'Dani Isis',
          resultado_alcancado: '37 veículos contratados: 24 vans, 11 micro-ônibus, 2 ônibus.',
          meta_quantitativa: '37 veículos / 16 Centros Culturais atendidos',
          status_meta: 'Cumprida',
          publico_estimado: 0, publico_total: 0, quantas_repeticoes: 1,
          observacoes: 'DIVERGÊNCIA FINANCEIRA DETECTADA: Total calculado R$ 33.600,00 / Valor informado R$ 33.400,00 / Diferença R$ 200,00 — REVISÃO FINANCEIRA OBRIGATÓRIA. Não importados: CPF, RG, telefone e nome completo de motoristas. Fonte: PDF pág. 8.',
        });
        log.divergencias.push('Transporte: total calculado R$ 33.600,00 vs. informado R$ 33.400,00 (R$ 200,00 de diferença — não corrigido automaticamente)');
        log.atividades_criadas++;
      }

      // ETAPA 8: Produção nos museus municipais
      setProgressoMsg('Importando produção nos museus municipais…'); setProgresso(58);
      const museusMunicipais = [
        { museu: 'MHAB', publico: 200, desc: 'Iluminação: 2 pontos (fachada e lateral do casarão), gambiarra palco/jardim, troca iluminação palco, ampliação passagem. Limpeza: 1 agente, foco banheiros, limpeza final 22h30. Segurança: 2 agentes. Monitor: 1 (apoio à produção).' },
        { museu: 'MIS', publico: 206, desc: 'Iluminação: refletores com gelatina na fachada, iluminação lateral (percurso garagem), gambiarra jardim. Limpeza: 1 agente, banheiros e quintal. Segurança: 1 agente (garagem). Monitor: 1 educativo.' },
        { museu: 'MUMO', publico: 506, desc: 'Iluminação: monumental fachada e varanda (3º piso), ambiente área café, artística teatro. Limpeza: 1 agente, banheiros e coleta lixo. Segurança: 1 agente (tarde e noite). Monitores: 2 (atendimento e produção).' },
        { museu: 'Casa Kubitschek', publico: 158, desc: 'Iluminação: monumental jardim, fachada, trajetos de acesso, gambiarra jardim interno superior. Limpeza: 1 agente, 4 banheiros, camarim, área expositiva sob demanda. Segurança: 1 agente (ronda com educativo, controle de entrada). Monitor: 1 educativo.' },
        { museu: 'Casa do Baile', publico: 424, desc: 'Iluminação: manter iluminação da edição anterior (entrada/ponte, pilastras, jardim). Limpeza: 1 agente, banheiros, manutenção e coleta. Segurança: 1 agente (guarda do salão). Monitor: 1 educativo.' },
        { museu: 'MAP', publico: 165, desc: 'Iluminação: tapar/redirecionar marquise, entradas e subida, reforço jardim, iluminação obra Sono da Solange Pessoa e obras jardim. Limpeza: 1 agente (jardim externo sob demanda). Segurança: 1 agente (ronda com educativo). Monitor: 1 (apoio à produção).' },
      ];
      if (checkboxes.importarAtividades) {
        for (const m of museusMunicipais) {
          await base44.asServiceRole.entities.Activity.create({
            report_id: reportId,
            titulo: `Produção no ${m.museu} – Noturno nos Museus 2026`,
            descricao: m.desc,
            data_inicio: '2026-06-01',
            data_fim: '2026-06-26',
            data_realizacao: '2026-06-26',
            classificacao: 'ROTINA',
            tipo_equipe: 'PRODUCAO',
            equipe_responsavel: 'Dani Isis',
            museu: m.museu,
            publico_estimado: m.publico,
            publico_total: m.publico,
            quantas_repeticoes: 1,
            resultado_alcancado: `Público estimado: ${m.publico} pessoas (ESTIMADO, fonte: relatório parcial).`,
            observacoes: `Público de ${m.publico} pessoas é ESTIMADO conforme PDF pág. 9. Fonte: Relatório Parcial de Produção — Noturno 2026.`,
          });
          log.atividades_criadas++;
        }
        log.campos_pendentes.push('Público geral total ainda em levantamento pela DMUS (não confirmado)');
      }

      // ETAPA 9: 90 atividades culturais
      setProgressoMsg(`Importando ${ATIVIDADES_CULTURAIS.length} atividades culturais…`); setProgresso(65);
      log.atividades_identificadas = ATIVIDADES_CULTURAIS.length;
      if (checkboxes.importarAtividades) {
        for (const atv of ATIVIDADES_CULTURAIS) {
          await base44.asServiceRole.entities.Activity.create({
            report_id: reportId,
            titulo: `[Nº ${atv.num}] ${atv.titulo}`,
            descricao: `Instituição: ${atv.instituicao}\nEndereço: ${atv.endereco}\nHorário: ${atv.horario}\nClassificação: ${atv.classificacao}\nVagas: ${atv.vagas}\nInscrição: ${atv.inscricao}\nGratuita: ${atv.gratuita ? 'Sim' : 'Não'}`,
            data_realizacao: '2026-06-26',
            classificacao: 'EXTRA',
            museu: atv.museu || '',
            tipo_equipe: 'PRODUCAO',
            equipe_responsavel: 'Dani Isis',
            publico_estimado: 0,
            publico_total: 0,
            quantas_repeticoes: 1,
            status_meta: 'Em andamento',
            observacoes: `status_documental: programação confirmada. fonte: Relatório Parcial de Produção — Noturno 2026. página PDF: ${atv.pagina_pdf}. tipo_atividade: ${atv.tipo}.`,
          });
          log.atividades_criadas++;
        }
      }

      // ETAPA 10: Fotos
      setProgressoMsg('Vinculando fotos extraídas do PDF…'); setProgresso(85);
      log.fotos_extraidas = FOTOS_PDF.length;
      if (checkboxes.importarFotos) {
        for (const foto of FOTOS_PDF) {
          await base44.asServiceRole.entities.ReportPhoto.create({
            report_id: reportId,
            file_url: PDF_URL,
            file_name: `${foto.titulo}.jpg`,
            caption: foto.legenda,
            legenda: foto.legenda,
            author: 'Dani Isis',
            museu: 'Noturno nos Museus',
            mes_referencia: 'Junho',
            ano: 2026,
            galeria_oculta: false,
            fonte_ia: 'upload_manual',
            contexto_ia: JSON.stringify({
              secao: foto.secao,
              pagina_pdf: foto.pagina_pdf,
              local: foto.local,
              data_aproximada: foto.data_aproximada,
              atividade: foto.atividade,
              projeto: 'Noturno nos Museus 2026',
              evento: '11ª Edição Noturno nos Museus',
              data_evento: '2026-06-26',
              responsavel_relatorio: 'Dani Isis',
              fonte_documental: 'Relatório Parcial de Produção — Noturno 2026',
              status_validacao: 'extraída de relatório, aguardando conferência',
            }),
            drive_backup_status: 'pendente',
          });
          log.fotos_vinculadas++;
        }
        log.fotos_ignoradas = 0;
      }

      // ETAPA 11: Log de importação
      setProgressoMsg('Registrando log de importação…'); setProgresso(95);
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'reports',
        entity_type: 'NOTURNO_2026_IMPORTACAO',
        entity_id: reportId,
        file_name: 'Relatório Parcial de Produção - 11ª Edição Noturno nos Museus - 2026.pdf',
        status: 'concluido',
        processed_at: new Date().toISOString(),
        details: JSON.stringify({
          ...log,
          relatorio_id: reportId,
          intake_id: intake.id,
          responsavel: 'Dani Isis',
          data_importacao: new Date().toISOString(),
          pdf_url: PDF_URL,
          paginas: 59,
          periodo: 'maio a julho de 2026',
          data_evento: '2026-06-26',
        }),
        total_files: 1,
        files_copied: 1,
        triggered_by: 'manual',
      });

      setProgresso(100);
      setResultado({ ...log, relatorio_id: reportId, intake_id: intake.id });
      setEtapa('concluido');
    } catch (e) {
      console.error(e);
      setErro(e.message || String(e));
      setEtapa('erro');
    }
  }, [checkboxes]);

  // ─── TELA DE REVISÃO ────────────────────────────────────────────────────────
  if (etapa === 'revisao') {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Revisão antes da importação</h2>
              <p className="text-sm text-gray-500">Relatório Parcial — 11ª Edição Noturno nos Museus 2026</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
          </div>

          <div className="p-6 space-y-4">
            {/* Resumo */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <button className="flex items-center justify-between w-full font-semibold text-blue-900" onClick={() => toggleSection('resumo')}>
                <span className="flex items-center gap-2"><FileText className="w-4 h-4" />Resumo do documento-fonte</span>
                {expandedSection === 'resumo' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSection === 'resumo' && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-blue-800">
                  {[['Responsável','Dani Isis'],['Projeto','Noturno nos Museus 2026'],['Período','Maio a Julho 2026'],['Data do evento','26/06/2026'],['Instituições','35'],['Atividades programadas','90 (programação prevista)'],['Centros Culturais','16 (público estimado: 655 pessoas)'],['Público museus municipais','1.659 pessoas (ESTIMADO)'],['Veículos contratados','37 (24 vans, 11 micro-ônibus, 2 ônibus)'],['Páginas PDF','59']].map(([k,v]) => (
                    <div key={k} className="bg-white rounded-lg p-2"><p className="text-xs text-blue-500">{k}</p><p className="font-medium">{v}</p></div>
                  ))}
                </div>
              )}
            </div>

            {/* Atividades */}
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <button className="flex items-center justify-between w-full font-semibold text-green-900" onClick={() => toggleSection('atividades')}>
                <span className="flex items-center gap-2"><Activity className="w-4 h-4" />Atividades a criar ({AGENDA_REUNIOES.length + 2 + 6 + ATIVIDADES_CULTURAIS.length} registros)</span>
                {expandedSection === 'atividades' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSection === 'atividades' && (
                <div className="mt-3 space-y-1 text-sm text-green-800">
                  <p>• <strong>1</strong> atividade consolidada de Agenda ({AGENDA_REUNIOES.length} reuniões/visitas técnicas)</p>
                  <p>• <strong>1</strong> atividade de Articulação Institucional (35 instituições / 90 atividades)</p>
                  <p>• <strong>1</strong> atividade de Articulação com Centros Culturais (16 CCs / 655 pessoas estimadas)</p>
                  <p>• <strong>1</strong> atividade de Sinalização (34 equipamentos atendidos)</p>
                  <p>• <strong>1</strong> atividade de Transporte (37 veículos)</p>
                  <p>• <strong>6</strong> atividades de Produção nos Museus Municipais</p>
                  <p>• <strong>{ATIVIDADES_CULTURAIS.length}</strong> atividades culturais da programação (numeradas 1 a 90)</p>
                </div>
              )}
            </div>

            {/* Fotos */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <button className="flex items-center justify-between w-full font-semibold text-amber-900" onClick={() => toggleSection('fotos')}>
                <span className="flex items-center gap-2"><Camera className="w-4 h-4" />Fotos extraídas ({FOTOS_PDF.length} registros)</span>
                {expandedSection === 'fotos' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSection === 'fotos' && (
                <div className="mt-3 space-y-2">
                  {FOTOS_PDF.map((f, i) => (
                    <div key={i} className="bg-white rounded-lg p-3 text-sm">
                      <p className="font-medium text-amber-900">{f.titulo}</p>
                      <p className="text-amber-700 text-xs mt-1">{f.legenda}</p>
                      <p className="text-amber-500 text-xs">Pág. {f.pagina_pdf} | Local: {f.local}</p>
                    </div>
                  ))}
                  <p className="text-xs text-amber-700 mt-2">⚠ Fotos vinculam ao PDF original. Arquivos de imagem separados não estão disponíveis no PDF entregue.</p>
                </div>
              )}
            </div>

            {/* Divergências */}
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <button className="flex items-center justify-between w-full font-semibold text-red-900" onClick={() => toggleSection('div')}>
                <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Divergências e pendências</span>
                {expandedSection === 'div' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSection === 'div' && (
                <div className="mt-3 space-y-2 text-sm text-red-800">
                  <div className="bg-white rounded-lg p-3"><p className="font-medium">💰 Divergência financeira – Transporte</p><p className="text-xs mt-1">Total calculado: R$ 33.600,00 | Valor informado: R$ 33.400,00 | Diferença: R$ 200,00. Status: revisão financeira obrigatória. Não corrigida automaticamente.</p></div>
                  <div className="bg-white rounded-lg p-3"><p className="font-medium">👥 Público geral em aberto</p><p className="text-xs mt-1">Público geral total ainda em levantamento pela DMUS — não consta no relatório parcial.</p></div>
                  <div className="bg-white rounded-lg p-3"><p className="font-medium">📊 Público = estimativa</p><p className="text-xs mt-1">Todos os números de público são ESTIMADOS. Não foram convertidos em confirmados.</p></div>
                  <div className="bg-white rounded-lg p-3"><p className="font-medium">🔒 Dados pessoais não importados</p><p className="text-xs mt-1">CPF, RG, telefone e nomes completos de motoristas/representantes de veículos foram omitidos conforme regras de importação.</p></div>
                  <div className="bg-white rounded-lg p-3"><p className="font-medium">📸 Fotos embutidas no PDF</p><p className="text-xs mt-1">As 4 fotos identificadas (wind banners e bandeirolas) estão incorporadas ao PDF. Registros criados com referência ao PDF original. Arquivos de imagem individuais não extraídos.</p></div>
                </div>
              )}
            </div>

            {/* Seleção */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Selecionar o que importar:</p>
              <div className="space-y-2">
                {[['importarRelatorio','Criar relatório principal em nome de Dani Isis'],['importarAgenda','Importar agenda (reuniões e visitas técnicas)'],['importarAtividades','Importar atividades culturais e de produção (90 programação + estruturais)'],['importarFotos','Vincular fotos extraídas à Galeria']].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={checkboxes[k]} onChange={() => setCheckboxes(p => ({ ...p, [k]: !p[k] }))} className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3 rounded-b-2xl">
            <Button variant="outline" onClick={onClose} className="flex-1"><X className="w-4 h-4 mr-2" />Cancelar</Button>
            <Button onClick={() => { /* salvar como rascunho */ }} variant="outline" className="flex-1"><Save className="w-4 h-4 mr-2" />Salvar como rascunho</Button>
            <Button onClick={executarImportacao} className="flex-1 bg-green-600 hover:bg-green-700 text-white"><CheckCircle className="w-4 h-4 mr-2" />Aprovar importação</Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── TELA DE PROGRESSO ───────────────────────────────────────────────────────
  if (etapa === 'importando') {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Importando relatório…</h2>
          <p className="text-sm text-gray-500 mb-4">{progressoMsg}</p>
          <Progress value={progresso} className="h-2 mb-2" />
          <p className="text-xs text-gray-400">{progresso}%</p>
        </div>
      </div>
    );
  }

  // ─── TELA DE ERRO ────────────────────────────────────────────────────────────
  if (etapa === 'erro') {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Erro na importação</h2>
          <p className="text-sm text-red-600 mb-4">{erro}</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Fechar</Button>
            <Button onClick={() => setEtapa('revisao')} className="flex-1">Tentar novamente</Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── TELA DE CONCLUSÃO ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b flex items-center gap-3">
          <CheckCircle className="w-8 h-8 text-green-600 shrink-0" />
          <div>
            <h2 className="text-lg font-bold text-gray-900">Importação concluída</h2>
            <p className="text-sm text-gray-500">Relatório de Dani Isis criado com sucesso</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {resultado && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ['ID do Relatório', resultado.relatorio_id || '—'],
                ['ID do Documento-fonte', resultado.intake_id || '—'],
                ['Atividades identificadas', resultado.atividades_identificadas + ' (programação)'],
                ['Atividades criadas', resultado.atividades_criadas],
                ['Fotos extraídas', resultado.fotos_extraidas],
                ['Fotos vinculadas', resultado.fotos_vinculadas],
                ['Fotos ignoradas', resultado.fotos_ignoradas],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">{k}</p>
                  <p className="font-semibold text-gray-900 text-sm break-all">{v}</p>
                </div>
              ))}
            </div>
          )}
          {resultado?.divergencias?.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Divergências registradas</p>
              {resultado.divergencias.map((d, i) => <p key={i} className="text-sm text-amber-800">• {d}</p>)}
            </div>
          )}
          {resultado?.campos_pendentes?.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="font-semibold text-blue-900 mb-2">Campos pendentes de validação</p>
              {resultado.campos_pendentes.map((p, i) => <p key={i} className="text-sm text-blue-800">• {p}</p>)}
            </div>
          )}
          <div className="rounded-xl bg-green-50 border border-green-200 p-4">
            <p className="text-sm text-green-800">✅ Relatório criado em nome de <strong>Dani Isis</strong> · Status: <strong>RASCUNHO</strong> · Aguardando revisão humana antes de publicação.</p>
          </div>
        </div>
        <div className="px-6 pb-6">
          <Button onClick={onConcluido || onClose} className="w-full bg-green-600 hover:bg-green-700 text-white">
            <Eye className="w-4 h-4 mr-2" />Ver relatório no sistema
          </Button>
        </div>
      </div>
    </div>
  );
}