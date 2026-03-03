// theme.js — centralized theme handling for Diet Dash
(function(){
  const root = document.body;
  const checkboxes = () => Array.from(document.querySelectorAll('.theme-toggle-checkbox'));

  function applyMode(mode){
    if (mode === 'dark'){
      root.classList.remove('light-mode');
      root.classList.add('dark-mode');
    } else {
      root.classList.remove('dark-mode');
      root.classList.add('light-mode');
    }
    // sync all checkboxes
    checkboxes().forEach(cb => { cb.checked = (mode === 'dark'); });
    localStorage.setItem('dietdash-theme', mode);
  }

  function init(){
    const saved = localStorage.getItem('dietdash-theme');
    if (saved) applyMode(saved);
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyMode('dark');
    else applyMode('light');

    // attach change listeners to all theme toggle checkboxes
    checkboxes().forEach(cb => cb.addEventListener('change', function(){
      applyMode(this.checked ? 'dark' : 'light');
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
