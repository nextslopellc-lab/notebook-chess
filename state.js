// [nb] state v1 — minimal session counters; no storage yet
(function () {
  const nb = (window.nb = window.nb || {});

  const state = {
    gamesStarted: 0,
    movesPlayed: 0,
    undos: 0,
    reset() {
      // called when user taps "New Free Play"
      state.movesPlayed = 0;
      state.undos = 0;
    },
  };

  nb.state = state;
})();
