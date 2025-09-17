/* Notebook Chess — Phase 1
   Plain JS + local chess.umd.js (no CDNs, no SW)
   Features:
   - Tap-to-move with per-piece legal target highlights (pins respected by chess.js)
   - Last-move highlight (both squares)
   - Smooth piece animation (CSS top/left transition)
   - Castling UX: tap king → tap landing; rook animates with it
   - Back/Review: on-screen Back + ArrowLeft
*/

(() => {
  const boardEl = document.getElementById('board');
  const piecesEl = document.getElementById('pieces');
  const hitEl = document.getElementById('hitlayer');
  const statusEl = document.getElementById('status');
  const btnBack = document.getElementById('btn-back');
  const btnReset = document.getElementById('btn-reset');
  const toggleLegal = document.getElementById('toggle-legal');

  const game = new window.Chess(); // chess.umd.js
  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['1','2','3','4','5','6','7','8'];
  const UNICODE = {
    p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
    P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
  };

  // Layout helpers
  const S = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-size'));
  const cellSize = () => S() / 8;
  const posFor = (square) => {
    const file = square[0], rank = square[1];
    const x = FILES.indexOf(file);
    const y = RANKS.indexOf(rank);
    // bottom = rank 1 near bottom in standard white orientation
    return { left: x * cellSize(), top: (7 - y) * cellSize() };
  };

  // Build squares once (absolute grid)
  function buildSquares() {
    for (let y = 0; y < 8; y++){
      for (let x = 0; x < 8; x++){
        const sq = document.createElement('div');
        const file = FILES[x], rank = RANKS[7 - y];
        const name = `${file}${rank}`;
        sq.className = 'square ' + ((x + y) % 2 ? 'dark' : 'light');
        sq.style.left = `${x * cellSize()}px`;
        sq.style.top = `${y * cellSize()}px`;
        sq.dataset.square = name;
        sq.setAttribute('role','gridcell');
        sq.setAttribute('aria-label', name);

        // Tiny coords for orientation
        if (x === 0 && y === 7){
          const c = document.createElement('span');
          c.className = 'coord';
          c.textContent = 'a1';
          sq.appendChild(c);
        }

        boardEl.appendChild(sq);
      }
    }
  }

  // Render pieces from game.fen()
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
    el.style.top = `${top}px`;
    el.dataset.square = square;
    return el;
  }

  // State for selection & review
  let selected = null;         // square string e.g. 'e2'
  let legalTargets = [];       // array of squares
  let lastFrom = null, lastTo = null;

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
    const a = squareEl(from), b = squareEl(to);
    a && a.classList.add('highlight-last');
    b && b.classList.add('highlight-last');
  }
  const squareEl = (sq) => document.querySelector(`.square[data-square="${sq}"]`);
  const pieceElAt = (sq) => Array.from(piecesEl.children).find(p => p.dataset.square === sq);

  // Compute legal moves for a piece on 'from'
  function legalFor(from){
    return game.moves({ square: from, verbose: true }).map(m => m.to);
  }

  // Selection / tap-to-move
  function selectSquare(sq){
    const piece = game.get(sq);
    if (!piece) { // tapping empty square cancels selection
      cancelSelection();
      return;
    }
    // Only allow moving the side to move
    if (piece.color !== game.turn()) {
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
    const fromEl = squareEl(selected);
    fromEl && fromEl.classList.add('highlight-from');
    if (toggleLegal.checked){
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
      // snap back feedback
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

    // Animate moved piece to 'to'
    const movingEl = pieceElAt(selected);
    if (movingEl){
      placePiece({ color: movingEl.dataset.color, type: movingEl.dataset.type }, to, movingEl);
    }

    // Handle captures: remove captured piece DOM if present on 'to' (already overwritten visually by movingEl)
    // chess.js already updated board; rebuild captured if needed by resync at end.

    // Handle castling rook animation
    if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))){
      // King-side or Queen-side
      const isWhite = move.color === 'w';
      if (move.to === 'g1' || move.to === 'g8'){
        const rookFrom = isWhite ? 'h1' : 'h8';
        const rookTo = isWhite ? 'f1' : 'f8';
        const rEl = pieceElAt(rookFrom) || pieceElAt(rookTo);
        if (rEl) placePiece({ color: move.color, type: 'r' }, rookTo, rEl);
      } else if (move.to === 'c1' || move.to === 'c8'){
        const rookFrom = isWhite ? 'a1' : 'a8';
        const rookTo = isWhite ? 'd1' : 'd8';
        const rEl = pieceElAt(rookFrom) || pieceElAt(rookTo);
        if (rEl) placePiece({ color: move.color, type: 'r' }, rookTo, rEl);
      }
    }

    // Sync all pieces to FEN to ensure capture/removal correctness
    syncAllPieces();

    // Last-move highlight
    lastFrom = move.from; lastTo = move.to;
    highlightLastMove(lastFrom, lastTo);

    // Clear selection
    cancelSelection();
    setStatus(`${prettyColor(move.color)} played ${move.san}. ${prettyTurn()} to move.`);
    return true;
  }

  function syncAllPieces(){
    // Remove extra
    const liveSquares = new Set();
    for (const p of piecesEl.children){ liveSquares.add(p.dataset.square); }
    // Clear and rebuild ensures correctness (simplest, reliable, fast for 32 pieces)
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

  function wiggle(el){
    if (!el) return;
    el.classList.remove('wiggle');
    // force reflow
    void el.offsetWidth;
    el.classList.add('wiggle');
  }

  function prettyColor(c){ return c === 'w' ? 'White' : 'Black'; }
  function prettyTurn(){ return prettyColor(game.turn()); }

  function setStatus(text){
    statusEl.textContent = text;
  }

  // Click/tap handling
  boardEl.addEventListener('click', (e) => {
    const sqEl = e.target.closest('.square');
    if (!sqEl) return;

    const sq = sqEl.dataset.square;

    if (!selected){
      // Try selecting a piece on this square
      if (game.get(sq)) selectSquare(sq);
      else {
        // tapping empty when nothing selected: ignore
      }
      return;
    }

    // If tapping same square -> cancel
    if (sq === selected){ cancelSelection(); return; }

    // Attempt move to tapped square
    moveSelected(sq);
  });

  // Back / Undo
  function undoOne(){
    const move = game.undo();
    if (!move){ setStatus('No moves to undo.'); return; }
    syncAllPieces();
    lastFrom = move.from; lastTo = move.to; // show what was undone
    highlightLastMove(lastFrom, lastTo);
    setStatus(`Undid ${prettyColor(move.color)}’s ${move.san}. ${prettyTurn()} to move.`);
    cancelSelection();
  }

  btnBack.addEventListener('click', undoOne);
  btnReset.addEventListener('click', () => {
    game.reset();
    syncAllPieces();
    clearLastMove(); cancelSelection();
    setStatus('Position reset. White to move.');
  });

  // Keyboard: ArrowLeft to undo
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft'){ e.preventDefault(); undoOne(); }
  });

  // Repaint squares & pieces on resize to keep perfect fit
  let built = false;
  function init(){
    if (!built){
      buildSquares();
      built = true;
    } else {
      // update absolute positions for squares
      document.querySelectorAll('.square').forEach(el => {
        const sq = el.dataset.square;
        const { left, top } = posFor(sq);
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
      });
    }
    renderPieces();
    clearLastMove(); cancelSelection();
    setStatus('Ready. White to move.');
  }
  window.addEventListener('resize', () => {
    // throttle minimal
    clearTimeout(window.__resizeTimer);
    window.__resizeTimer = setTimeout(init, 60);
  });

  // Boot
  init();
})();
