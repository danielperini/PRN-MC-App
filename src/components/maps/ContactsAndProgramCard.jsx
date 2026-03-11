import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Mail, Phone, Clock, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ContactsAndProgramCard({ contacts, programmingSuggestion }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!contacts || contacts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Contatos */}
      <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
        <div className="mb-4">
          <h3 className="font-bold text-lg text-gray-900 mb-1">10 Locais com Aderência ≥ 80%</h3>
          <p className="text-xs text-gray-600">Contatos e programação atual</p>
        </div>

        <div className="space-y-3">
          {contacts.map((contact, idx) => (
            <div key={idx} className="bg-white rounded-lg p-4 border border-amber-100">
              <button
               onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
               className="w-full text-left flex items-center justify-between hover:bg-amber-50 -m-4 p-4 rounded-lg"
              >
               <div className="flex-1">
                 <div className="font-semibold text-gray-900">{contact.nome}</div>
                 <div className="text-xs text-gray-500">{contact.categoria} • Aderência: {contact.aderencia}%</div>
                 {contact.bairro && (
                   <div className="text-xs text-gray-500 mt-0.5">{contact.bairro}</div>
                 )}
               </div>
                {expandedIndex === idx ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {expandedIndex === idx && (
                <div className="mt-3 space-y-2 pt-3 border-t border-amber-100">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-orange-600" />
                      <a href={`mailto:${contact.email}`} className="text-orange-600 hover:underline break-all">
                        {contact.email}
                      </a>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-orange-600" />
                      <a href={`tel:${contact.phone}`} className="text-orange-600 hover:underline">
                        {contact.phone}
                      </a>
                    </div>
                  )}
                  {contact.hours && (
                    <div className="flex items-start gap-2 text-sm">
                      <Clock className="w-4 h-4 text-orange-600 mt-0.5" />
                      <span className="text-gray-700">{contact.hours}</span>
                    </div>
                  )}
                  {contact.program && (
                    <div className="text-sm text-gray-700 bg-amber-50 p-2 rounded border border-amber-200">
                      <span className="font-semibold text-gray-900">Programação: </span>
                      {contact.program}
                    </div>
                  )}
                  {contact.activities && (
                    <div className="text-sm text-gray-700 bg-amber-50 p-2 rounded border border-amber-200">
                      <span className="font-semibold text-gray-900">Atividades: </span>
                      {contact.activities}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Sugestões de Programação */}
      {programmingSuggestion && (
        <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">Sugestões de Programação Colaborativa</h3>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {programmingSuggestion}
              </p>
              <div className="text-xs text-gray-500 mt-3">
                {programmingSuggestion.length} / 600 caracteres
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}