export function installRelatorioSingleProgress() {
  if (typeof window === 'undefined' || window.__relatorioSingleProgressInstalled) return;
  window.__relatorioSingleProgressInstalled = true;

  const apply = () => {
    if (!/RelatorioExecucaoObjeto/i.test(window.location.pathname)) return;
    document.querySelectorAll('[data-relatorio-workflow]').forEach((element) => {
      element.style.display = 'none';
      element.setAttribute('aria-hidden', 'true');
    });
  };

  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
}
