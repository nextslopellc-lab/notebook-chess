// [nb] log v1 — safe-to-call hooks; console only for now
(function () {
  const nb = (window.nb = window.nb || {});
  const state = nb.state || (nb.state = { gamesStarted: 0, movesPlayed: 0, undos: 0, reset(){} });

  nb.log = {
    onNewGame() {
      state.gamesStarted += 1;
      console.log(`[NB] New game #${state.gamesStarted} (session)`);
    },
    onMove(move, game) {
      state.movesPlayed += 1;
      // Try to show SAN if present; otherwise show from→to
      let san = '';
      try { san = typeof move.san === 'string' ? move.san : ''; } catch (_) {}
      console.log(`[NB] Move ${state.movesPlayed}: ${move.from}→${move.to}${san ? ' ('+san+')' : ''}`);
    },
    onUndo(undone, game) {
      state.undos += 1;
      let fen = '';
      try { fen = game && typeof game.fen === 'function' ? game.fen() : ''; } catch(_) {}
      console.log(`[NB] Undo #${state.undos}${fen ? ' — fen: ' + fen : ''}`);
    },
  };
})();
