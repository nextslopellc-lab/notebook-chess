/* Notebook Chess — Phase 1 (clean full file)
   Plain JS + local chess (ESM shim sets window.Chess)
   Features:
   - Tap-to-move with per-piece legal target highlights (pins respected by chess.js)
   - Last-move highlight (both squares)
   - Smooth piece animation (CSS left/top transition)
   - Castling UX: tap king → tap g/c; rook animates with it
   - Back/Review: Back button + ArrowLeft undo
   - Robust layout: uses actual board width; rebuilds on resize
*/

(() => {
  // ------- DOM refs -------
  const boardEl  = document.getElementById('board');
  const piecesEl = document.getElementById('pieces');
  const statusEl = document.getElementById('status');
  const btnBack  = document.getElementById('btn-back');
  const btnReset = document.getElementById('btn-reset');
  const toggleLegal = document.getElementById('toggle-legal');

  // ------- Chess state -------
  const game = new window.Chess(); // provided by index.html module shim
  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['1','2','3','4','5','6','7','8'];
  const UNICODE = {
    p:'♟', r:'♜', n:'♞', b:'♝', q:'♛', k:'♚',
    P:'♙', R:'♖', N:'♘', B:'♗', Q:'♕', K:'♔'
  };

  // ------- Layout helpers -------
  const S        = () => boardEl.getBoundingClientRect().width; // actual rendered width
  const cellSize = () => S() / 8;
  const posFor = (square) => {
     const file = square[0], rank = square[1];
     const x = FILES.indexOf(file);
     const y = RANKS.indexOf(rank);
     return { left: x * cellSize(), top: (8 - y) * cellSize() };
};


  // ------- Squares (board layer) -------
  function buildSquares() {
    // Clear any existing (safe to call multiple times)
    boardEl.querySelectorAll('.square').forEach(n => n.remove());

    for (let y = 0; y < 8; y++){
      for (let x = 0; x < 8; x++){
        const file = FILES[x], rank = RANKS[7 - y];
        const name = `${file}${rank}`;

        const sq = document.createElement('div');
        sq.className = 'square ' + ((x + y) % 2 ? 'dark' : 'light');
        sq.style.left = `${x * cellSize()}px`;
        sq.style.top  = `${y * cellSize()}px`;
        sq.dataset.square = name;
        sq.setAttribute('role','gridcell');
        sq.setAttribute('aria-label', name);

        boardEl.appendChild(sq);
      }
    }
  }

  function positionSquares(){
    document.querySelectorAll('.square').forEach(el => {
      const sq = el.dataset.square;
      const x = FILES.indexOf(sq[0]);
      const y = RANKS.indexOf(sq[1]);
      el.style.left = `${x * cellSize()}px`;
      el.style.top  = `${y * cellSize()}px`;
    });
  }

  // ------- Pieces (pieces layer) -------
  function renderPieces() {
    piecesEl.innerHTML = '';
    const board = game.board();
    for (let r = 0; r < 8; r++){
      for (let f = 0; f < 8; f++){
        const piece = board[r][f];
        if (!piece) continue;
        const sq = `${FILES[f]}${RANKS[7 - r]}`;
        placePiece(piece, sq);
      }
    }
  }

  function placePiece(piece, square, existingEl){
    const { left, top } = posFor(square);
    const isWhite = piece.color === 'w';
    let el = existingEl || document.createElement('div');
    if (!existingEl){
      el.className = `piece ${isWhite ? 'white':'black'}`;
      el.dataset.square = square;
      el.dataset.color = piece.color;
      el.dataset.type = piece.type;
      el.textContent = UNICODE[(isWhite ? piece.type.toUpperCase(): piece.type)];
      piecesEl.appendChild(el);
    }
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
    el.dataset.square = square;
    return el;
  }

  function syncAllPieces(){
    piecesEl.innerHTML = '';
    const board = game.board();
    for (let r = 0; r < 8; r++){
      for (let f = 0; f < 8; f++){
        const piece = board[r][f];
        if (!piece) continue;
        const sq = `${FILES[f]}${RANKS[7 - r]}`;
        placePiece(piece, sq);
      }
    }
  }

  // ------- Selection / highlights -------
  let selected = null;         // e.g., 'e2'
  let legalTargets = [];       // array of squares
  let lastFrom = null, lastTo = null;

  const squareEl = (sq) => document.querySelector(`.square[data-square="${sq}"]`);
  const pieceElAt = (sq) => Array.from(piecesEl.children).find(p => p.dataset.square === sq);

  function clearHighlights(){
    document.querySelectorAll('.highlight-target').forEach(n => n.classList.remove('highlight-target'));
    document.querySelectorAll('.highlight-from').forEach(n => n.classList.remove('highlight-from'));
  }
  function clearLastMove(){
    document.querySelectorAll('.highlight-last').forEach(n => n.classList.remove('highlight-last'));
  }
  function highlightLastMove(from, to){
    clearLastMove();
    if (!from || !to) return;
    squareEl(from)?.classList.add('highlight-last');
    squareEl(to)?.classList.add('highlight-last');
  }

  function legalFor(from){
    return game.moves({ square: from, verbose: true }).map(m => m.to);
  }

  function selectSquare(sq){
    const piece = game.get(sq);
    if (!piece){ cancelSelection(); return; }

    if (piece.color !== game.turn()){
      wiggle(pieceElAt(sq));
      setStatus("It's not that side to move.");
      return;
    }
    selected = sq;
    legalTargets = legalFor(sq);
    paintSelection();
  }

  function paintSelection(){
    clearHighlights();
    if (!selected) return;
    squareEl(selected)?.classList.add('highlight-from');
    if (toggleLegal?.checked){
      legalTargets.forEach(t => squareEl(t)?.classList.add('highlight-target'));
    }
  }

  function cancelSelection(){
    selected = null;
    legalTargets = [];
    clearHighlights();
  }

  function moveSelected(to){
    if (!selected) return false;
    const triedLegal = legalTargets.includes(to);
    if (!triedLegal){
      wiggle(pieceElAt(selected));
      setStatus(`Illegal move to ${to}.`);
      return false;
    }
    const move = game.move({ from: selected, to, promotion: 'q' });
    if (!move){
      wiggle(pieceElAt(selected));
      setStatus(`Move rejected.`);
      return false;
    }

    // Animate moved piece
    const movingEl = pieceElAt(selected);
    if (movingEl){
      placePiece({ color: movingEl.dataset.color, type: movingEl.dataset.type }, to, movingEl);
    }

    // Castling rook animation
    if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))){
      const isWhite = move.color === 'w';
      if (move.to === 'g1' || move.to === 'g8'){
        const rookFrom = isWhite ? 'h1' : 'h8';
        const rookTo   = isWhite ? 'f1' : 'f8';
        const rEl = pieceElAt(rookFrom) || pieceElAt(rookTo);
        if (rEl) placePiece({ color: move.color, type: 'r' }, rookTo, rEl);
      } else if (move.to === 'c1' || move.to === 'c8'){
        const rookFrom = isWhite ? 'a1' : 'a8';
        const rookTo   = isWhite ? 'd1' : 'd8';
        const rEl = pieceElAt(rookFrom) || pieceElAt(rookTo);
        if (rEl) placePiece({ color: move.color, type: 'r' }, rookTo, rEl);
      }
    }

    // Ensure captures/removals are correct
    syncAllPieces();

    // Last-move highlight
    lastFrom = move.from; lastTo = move.to;
    highlightLastMove(lastFrom, lastTo);

    // Clear selection
    cancelSelection();
    setStatus(`${prettyColor(move.color)} played ${move.san}. ${prettyTurn()} to move.`);
    return true;
  }

  // ------- UX helpers -------
  function wiggle(el){
    if (!el) return;
    el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle');
  }
  function prettyColor(c){ return c === 'w' ? 'White' : 'Black'; }
  function prettyTurn(){ return prettyColor(game.turn()); }
  function setStatus(text){ statusEl.textContent = text; }

  // ------- Events -------
  boardEl.addEventListener('click', (e) => {
    const sqEl = e.target.closest('.square');
    if (!sqEl) return;
    const sq = sqEl.dataset.square;

    if (!selected){
      if (game.get(sq)) selectSquare(sq);
      return;
    }
    if (sq === selected){ cancelSelection(); return; }
    moveSelected(sq);
  });

  function undoOne(){
    const move = game.undo();
    if (!move){ setStatus('No moves to undo.'); return; }
    syncAllPieces();
    lastFrom = move.from; lastTo = move.to; // show what was undone
    highlightLastMove(lastFrom, lastTo);
    setStatus(`Undid ${prettyColor(move.color)}’s ${move.san}. ${prettyTurn()} to move.`);
    cancelSelection();
  }

  btnBack?.addEventListener('click', undoOne);
  btnReset?.addEventListener('click', () => {
    game.reset();
    syncAllPieces();
    clearLastMove(); cancelSelection();
    setStatus('Position reset. White to move.');
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft'){ e.preventDefault(); undoOne(); }
  });

  // Keep layout correct on resize (throttled)
  window.addEventListener('resize', () => {
    clearTimeout(window.__resizeTimer);
    window.__resizeTimer = setTimeout(() => {
      positionSquares();
      for (const el of piecesEl.children){
        const sq = el.dataset.square;
        const { left, top } = posFor(sq);
        el.style.left = `${left}px`;
        el.style.top  = `${top}px`;
      }
    }, 60);
  });

  // ------- Boot (after layout is ready) -------
  function init(){
    // Wait one frame so CSS has applied and S() returns a real width
    requestAnimationFrame(() => {
      buildSquares();
      renderPieces();
      clearLastMove(); cancelSelection();
      setStatus('Ready. White to move.');
    });
  }
  init();
})();
