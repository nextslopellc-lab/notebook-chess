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
  const UNICODE = {
    p:'♟', r:'♜', n:'♞', b:'♝', q:'♛', k:'♚',
    P:'♙', R:'♖', N:'♘', B:'♗', Q:'♕', K:'♔'
  };

  const cellSize = () => boardEl.getBoundingClientRect().width / 8;
  const posFor = (sq) => {
    const file = sq[0], rank = parseInt(sq[1],10);
    const x = FILES.indexOf(file);
    const y = rank - 1;               // rank "1" = bottom
    return { left: x * cellSize(), top: (7 - y) * cellSize() };
  };

  function buildSquares() {
    boardEl.querySelectorAll('.square').forEach(n => n.remove());
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const file = FILES[x], rank = RANKS[7 - y];
        const name = `${file}${rank}`;
        const sq = document.createElement('div');
        sq.className = 'square ' + ((x + y) % 2 ? 'dark' : 'light');
        sq.style.left = `${x * cellSize()}px`;
        sq.style.top  = `${y * cellSize()}px`;
        sq.dataset.square = name;
        boardEl.appendChild(sq);
      }
    }
  }

  function renderPieces() {
    piecesEl.innerHTML = '';
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (!piece) continue;
        const sq = `${FILES[f]}${RANKS[7 - r]}`;
        placePiece(piece, sq);
      }
    }
  }

  function placePiece(piece, square, existingEl) {
    const { left, top } = posFor(square);
    let el = existingEl || document.createElement('div');
    if (!existingEl) {
      el.className = `piece ${piece.color === 'w' ? 'white':'black'}`;
      el.dataset.square = square;
      el.dataset.color = piece.color;
      el.dataset.type = piece.type;
      el.textContent = UNICODE[piece.color === 'w' ? piece.type.toUpperCase() : piece.type];
      piecesEl.appendChild(el);
    }
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
    el.dataset.square = square;
    return el;
  }

  let selected = null, legalTargets = [], lastFrom = null, lastTo = null;
  const squareEl = (sq) => document.querySelector(`.square[data-square="${sq}"]`);
  const pieceElAt = (sq) => Array.from(piecesEl.children).find(p => p.dataset.square === sq);

  function clearHighlights() {
    document.querySelectorAll('.highlight-target,.highlight-from').forEach(n => n.classList.remove('highlight-target','highlight-from'));
  }
  function clearLastMove() {
    document.querySelectorAll('.highlight-last').forEach(n => n.classList.remove('highlight-last'));
  }
  function highlightLastMove(from,to) {
    clearLastMove();
    squareEl(from)?.classList.add('highlight-last');
    squareEl(to)?.classList.add('highlight-last');
  }

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
    if (toggleLegal?.checked) {
      legalTargets.forEach(t => squareEl(t)?.classList.add('highlight-target'));
    }
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

  function syncAllPieces() { renderPieces(); }

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
  window.addEventListener('resize', () => { buildSquares(); syncAllPieces(); });

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
