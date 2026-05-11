import React, { useEffect } from 'react';
import DashboardPatrocinador from './DashboardPatrocinador';

const TEXTO_ORIGINAL = 'Três trechos positivos selecionados para publicação';
const TEXTO_NOVO = 'Trechos de Relatórios';

function replaceTextNode(node) {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.includes(TEXTO_ORIGINAL)) {
    node.nodeValue = node.nodeValue.replace(TEXTO_ORIGINAL, TEXTO_NOVO);
    return;
  }

  node.childNodes?.forEach((child) => replaceTextNode(child));
}

export default function DashboardPatrocinadorTextos() {
  useEffect(() => {
    const apply = () => replaceTextNode(document.body);

    apply();

    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, []);

  return <DashboardPatrocinador />;
}
