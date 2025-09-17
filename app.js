(() => {
  const boardEl  = document.getElementById('board');
  const piecesEl = document.getElementById('pieces');
  const statusEl = document.getElementById('status');
  const btnBack  = document.getElementById('btn-back');
  const btnReset = document.getElementById('btn-reset');
  const toggleLegal = document.getElementById('toggle-legal');

  const game = new window.Chess();
  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['1','2','3','4','5','6','7','8'];
  const UNICODE = { p:'♟', r:'♜', n:'♞', b:'♝', q:'♛', k:'♚', P:'♙', R:'♖', N:'♘', B:'♗', Q:'♕', K:'♔' };

  const cellSize = () => boardEl.getBoundingClientRect().width / 8;

  const posFor = (sq) => {
    const file = sq[0], rank = parseInt(sq[1],10);     // '1'..'8'
    const x = FILES.indexOf(file);
    const y = 7 - (rank - 1);                           // rank 1 at bottom
    const c = cellSize();
    return { left: x * c, top: y * c };
  };

  // Build 64 squares and size them from JS so CSS can't drift
  function buildSquares() {
    boardEl.querySelectorAll('.square').forEach(n => n.remove());
    const c = cellSize();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const file = FILES[x], rank = RANKS[7 - y];
        const name = `${file}${rank}`;
        const sq = document.createElement('div');
        sq.className = 'square';
        sq.dataset.square = name;
        sq.style.width = `${c}px`;
        sq.style.height = `${c}px`;
        sq.style.left = `${x * c}px`;
        sq.style.top  = `${y * c}px`;
        boardEl.appendChild(sq);
      }
    }
  }

  function renderPieces() {
    piecesEl.innerHTML = '';
    const c = cellSize();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (!piece) continue;
        const sq = `${FILES[f]}${RANKS[7 - r]}`;
        placePiece(piece, sq, null, c);
      }
    }
  }

  function placePiece(piece, square, existingEl, cachedC) {
    const c = cachedC ?? cellSize();
    const { left, top } = posFor(square);
    let el = existingEl || document.createElement('div');
    if (!existingEl) {
      el.className = `piece ${piece.color === 'w' ? 'white':'black'}`;
      el.dataset.square = square;
      el.dataset.color = piece.color;
      el.dataset.type = piece.type;

      const span = document.createElement('span');
      span.textContent = UNICODE[piece.color === 'w' ? piece.type.toUpperCase() : piece.type];
      el.appendChild(span);

      piecesEl.appendChild(el);
    }
    el.style.width = `${c}px`;
    el.style.height = `${c}px`;
    el.style.fontSize = `${c * 0.78}px`;
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
    el.dataset.square = square;
    return el;
  }

  function syncAllPieces() { renderPieces(); }

  // Selection & highlights
  let selected = null, legalTargets = [], lastFrom = null, lastTo = null;
  const squareEl = (sq) => document.querySelector(`.square[data-square="${sq}"]`);

  function clearHighlights() {
    document.querySelectorAll('.highlight-target,.highlight-from').forEach(n => n.classList.remove('highlight-target','highlight-from'));
  }
  function clearLastMove() { document.querySelectorAll('.highlight-last').forEach(n => n.classList.remove('highlight-last')); }
  function highlightLastMove(from,to) { clearLastMove(); squareEl(from)?.classList.add('highlight-last'); squareEl(to)?.classList.add('highlight-last'); }

  function selectSquare(sq) {
    const piece = game.get(sq);
    if (!piece) { cancelSelection(); return; }
    if (piece.color !== game.turn()) { setStatus("Not your turn."); return; }
    selected = sq;
    legalTargets = game.moves({ square: sq, verbose: true }).map(m => m.to);
    paintSelection();
  }

  function paintSelection() {
    clearHighlights();
    if (!selected) return;
    squareEl(selected)?.classList.add('highlight-from');
    if (toggleLegal?.checked) legalTargets.forEach(t => squareEl(t)?.classList.add('highlight-target'));
  }

  function cancelSelection(){ selected=null; legalTargets=[]; clearHighlights(); }

  function moveSelected(to) {
    if (!selected) return;
    if (!legalTargets.includes(to)) { setStatus("Illegal move."); return; }
    const move = game.move({ from: selected, to, promotion:'q' });
    if (!move) return;
    syncAllPieces();
    lastFrom = move.from; lastTo = move.to;
    highlightLastMove(lastFrom,lastTo);
    cancelSelection();
    setStatus(`${move.san}. ${game.turn()==='w'?'White':'Black'} to move.`);
  }

  // Events
  boardEl.addEventListener('click', e => {
    const sqEl = e.target.closest('.square');
    if (!sqEl) return;
    const sq = sqEl.dataset.square;
    if (!selected) { if (game.get(sq)) selectSquare(sq); return; }
    if (sq === selected) { cancelSelection(); return; }
    moveSelected(sq);
  });

  btnBack?.addEventListener('click', () => { game.undo(); syncAllPieces(); cancelSelection(); });
  btnReset?.addEventListener('click', () => { game.reset(); syncAllPieces(); cancelSelection(); setStatus('Reset. White to move.'); });
  window.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { game.undo(); syncAllPieces(); cancelSelection(); } });

  // Resize: recompute everything to keep sizes in sync
  window.addEventListener('resize', () => {
    const c = cellSize();
    buildSquares();
    // resize & reposition pieces too
    for (const el of Array.from(piecesEl.children)) {
      const sq = el.dataset.square;
      placePiece({ color: el.dataset.color, type: el.dataset.type }, sq, el, c);
    }
  });

  function setStatus(t){ statusEl.textContent = t; }

  function init() {
    requestAnimationFrame(() => {
      buildSquares();
      renderPieces();
      setStatus('Ready. White to move.');
    });
  }
  init();
})();
