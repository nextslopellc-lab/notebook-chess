// state.js
(function(){
  const KEY = 'nb.state.v1';
  const DEFAULT = { mode: 'free-play', feedback: 'post-game' }; // post-game | phase | live

  function load(){
    try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)||'{}') }; }
    catch { return { ...DEFAULT }; }
  }
  function save(s){ localStorage.setItem(KEY, JSON.stringify(s)); }

  const state = load();
  window.NBState = {
    get(){ return { ...state }; },
    set(patch){ Object.assign(state, patch); save(state);
      document.dispatchEvent(new CustomEvent('nb:state', { detail: { ...state } })); },
    setMode(m){ this.set({ mode: m }); },
    setFeedback(f){ this.set({ feedback: f }); }
  };
})();
