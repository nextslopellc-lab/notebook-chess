/* ============================================================================
  Notebook Chess - Phase 1 (Refactor Base)
  - Plain JS, no frameworks. Uses window.Chess (ESM shim from index.html).
  - Renders 8x8 absolute grid, Unicode pieces, smooth move animations.
  - Legal targets as DOTS via CSS: .square.target::after { ... }
  - Check / Checkmate highlight: .square.check / .square.mate
  - Undo: Back button + ArrowLeft
  - Castling UX: tap King then the landing square (rook animates)
  - Maintains: last-move highlight, snap-back-on-illegal (visual)
  - New: Menu/Resign overlay wiring, always-on legal targets
============================================================================ */

(function () {
  // ------------------------ DOM query helpers ------------------------
  function el(sel, root=document) { return root.querySelector(sel); }
  function $all(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

  // ---------------------------- DOM refs & constants -------------------------
  const boardEl = ensureBoardContainer(); // will find #board or create one at top of body
  const squaresLayer = el('.squares') || makeLayer('squares'); // grid layer
  const piecesLayer = el('.pieces') || makeLayer('pieces');    // pieces layer (pointer-events: none in CSS)

  // Topbar controls (already in your HTML)
  const backBtn   = el('#backBtn');
  const menuBtn   = el('#menuBtn');
  const resignBtn = el('#resignBtn');

  // Overlay (already in your HTML)
  const homeOverlay  = el('#homeOverlay');
  const closeOverlay = el('#closeOverlay');

  // Status element (keep same id/class you already have)
  const statusEl = el('#status') || ensureStatus();

  // Core chess state
  const Chess = window.Chess;
  let game = window.game instanceof Chess ? window.game : new Chess();
  window.game = game; // expose for console/debug

  // Selection state
  let selectedFrom = null; // e.g., "e2"
  let lastMove = null;     // {from, to}

  // Files/ranks helpers
  const FILES = ['a','b','c','d','e','f','g','h'];

  // ------------------------------- Boot --------------------------------------
  buildBoardIfNeeded();
  layoutBoard();              // position squares absolute by size
  renderAllPieces();          // draw pieces for current FEN
  applyLastMoveHighlight();   // no-op initially
  applyCheckMateRings();      // check state after initial render
  setStatus('Ready.');

  // Event wiring
  boardEl.addEventListener('click', onBoardClick, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  // Undo / Back
  backBtn?.addEventListener('click', onUndo);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') onUndo();
  });

  // Overlay
  menuBtn?.addEventListener('click', openOverlay);
  closeOverlay?.addEventListener('click', closeOverlayFn);
  resignBtn?.addEventListener('click', () => {
    if (!confirm('Resign and return to menu?')) return;
    openOverlay();
  });
  homeOverlay?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'continue-game') {
      closeOverlayFn();
    } else if (action === 'free-play') {
      game = new Chess();
      window.game = game;
      selectedFrom = null;
      lastMove = null;
      rerenderEverything();
      closeOverlayFn();
    } else {
      alert('Coming soon!');
    }
  });

  // ---------------------------- Event handlers -------------------------------
 function onBoardClick(e) {
  // Try DOM target first (ideal path)
  let sqEl = e.target.closest?.('.square');
  let sq = sqEl?.dataset?.square;

  // Fallback if clicks hit the piece layer or any sibling/child:
  if (!sq) {
    sq = squareFromEvent(e);
    if (sq) sqEl = squareEl(sq);
  }
  if (!sq) return; // clicked outside the 8x8 area

  // Selection / move flow (unchanged)
  if (!selectedFrom) {
    const piece = game.get(sq);
    if (!piece || piece.color !== game.turn()) {
      flashIllegal(sqEl);
      return;
    }
    selectedFrom = sq;
    showLegalTargets(selectedFrom); // ALWAYS ON
    return;
  }

  if (selectedFrom === sq) {
    selectedFrom = null;
    clearLegalTargets();
    return;
  }

  const move = game.move({ from: selectedFrom, to: sq, promotion: 'q' });
  if (!move) {
    flashIllegal(sqEl);
    return;
  }

  selectedFrom = null;
  clearLegalTargets();
  animateAndSync(move);
}

  function onUndo() {
    const undone = game.undo();
    if (!undone) {
      flashIllegal(boardEl);
      return;
    }
    selectedFrom = null;
    clearLegalTargets();
    rerenderEverything();
  }

  // ---------------------------- Render & Layout ------------------------------
  function buildBoardIfNeeded() {
    if (squaresLayer.childElementCount === 64) return;
    squaresLayer.innerHTML = '';
    // Create 64 absolute squares with data-square, light/dark classes
    // NOTE: rank 8 at top to rank 1 at bottom (standard chessboard)
    for (let rank = 8; rank >= 1; rank--) {
      for (let f = 0; f < 8; f++) {
        const file = FILES[f];
        const sq = `${file}${rank}`;
        const isDark = (f + rank) % 2 === 0;
        const d = document.createElement('div');
        d.className = `square ${isDark ? 'dark' : 'light'}`;
        d.dataset.square = sq;
        squaresLayer.appendChild(d);
      }
    }
  }

  function layoutBoard() {
    // Compute square positions based on board size (absolute grid)
    const boardRect = boardEl.getBoundingClientRect();
    const boardSize = Math.min(boardRect.width, boardRect.height || boardRect.width);
    const cell = boardSize / 8;

    // NOTE: enforce a square board via CSS var (optional if you already have it)
    boardEl.style.setProperty('--board-size', `${boardSize}px`);

    // Place squares
    const nodes = squaresLayer.children;
    for (let i = 0; i < nodes.length; i++) {
      const sqEl = nodes[i];
      const { square } = sqEl.dataset;
      const [x, y] = sqToXY(square); // file 0..7, rank 0..7 from bottom
      // Absolutely position each square
      sqEl.style.position = 'absolute';
      sqEl.style.left = `${x * cell}px`;
      // y=0 is rank 1 bottom; need to invert for top-origin:
      sqEl.style.top = `${(7 - y) * cell}px`;
      sqEl.style.width = `${cell}px`;
      sqEl.style.height = `${cell}px`;
    }

    // Also update piece positions to align with new cell size
    positionAllPieceNodes(cell);
  }

  function renderAllPieces() {
    piecesLayer.innerHTML = '';
    const cell = currentCell();

    // Walk all squares and add piece nodes
    for (let rank = 1; rank <= 8; rank++) {
      for (let f = 0; f < 8; f++) {
        const file = FILES[f];
        const sq = `${file}${rank}`;
        const p = game.get(sq);
        if (!p) continue;
        const node = makePieceNode(p, sq);
        piecesLayer.appendChild(node);
        placePieceNode(node, sq, cell);
      }
    }
  }

  function rerenderEverything() {
    clearLastMoveHighlight();
    clearCheckMateRings();
    renderAllPieces();
    applyLastMoveHighlight();
    applyCheckMateRings();
    setStatusDefault();
  }

  // ----------------------------- Highlights ----------------------------------
  function showLegalTargets(fromSq) {
    clearLegalTargets();
    const moves = game.moves({ square: fromSq, verbose: true }) || [];
    for (const m of moves) {
      const el = squareEl(m.to);
      if (el) el.classList.add('target'); // CSS draws the dot
    }
  }

  function clearLegalTargets() {
    $all('.square.target').forEach(n => n.classList.remove('target'));
  }

  function applyLastMoveHighlight() {
    if (!lastMove) return;
    squareEl(lastMove.from)?.classList.add('last-from');
    squareEl(lastMove.to)?.classList.add('last-to');
  }

  function clearLastMoveHighlight() {
    $all('.square.last-from').forEach(n => n.classList.remove('last-from'));
    $all('.square.last-to').forEach(n => n.classList.remove('last-to'));
  }

  function applyCheckMateRings() {
    clearCheckMateRings();
    if (game.in_checkmate?.()) {
      const matedColor = game.turn(); // side to move is mated
      const ksq = findKingSquare(matedColor);
      if (ksq) squareEl(ksq)?.classList.add('mate');
      setStatus('Checkmate.');
      return;
    }
    if (game.in_check?.()) {
      const inCheck = game.turn();
      const ksq = findKingSquare(inCheck);
      if (ksq) squareEl(ksq)?.classList.add('check');
      setStatus('Check.');
      return;
    }
    // else keep default status
  }

  function clearCheckMateRings() {
    $all('.square.check').forEach(n => n.classList.remove('check'));
    $all('.square.mate').forEach(n => n.classList.remove('mate'));
  }

  // ------------------------------ Moves & Anim -------------------------------
  function animateAndSync(move) {
    // move is chess.js verbose move (we request verbose below)
    // But when using game.move({from,to}), chess.js returns non-verbose by default.
    // So we’ll reconstruct lastMove with known from/to and set flags by checking board.
    lastMove = { from: move.from, to: move.to };

    // Rerender pieces with animation: we move only changed nodes
    const cell = currentCell();

    // If castling, animate rook as well
    animateRookIfCastling(move, cell);

    // Move the piece node (we’ll re-create if absent)
    const movedNode =
      piecesLayer.querySelector(`.piece[data-square="${move.from}"]`) ||
      makePieceNode(game.get(move.to), move.from); // fallback if not present

    // Update piece glyph to match whatever arrived at 'to' (promotion etc.)
    const nowAtTo = game.get(move.to);
    if (movedNode && nowAtTo) {
      movedNode.dataset.square = move.to;
      movedNode.dataset.type = nowAtTo.type;
      movedNode.dataset.color = nowAtTo.color;
      movedNode.querySelector('span').textContent = unicodeFor(nowAtTo);
      placePieceNode(movedNode, move.to, cell);
    }

    // Remove any captured piece node at destination (if leftover)
    // Safer approach: full re-render after small delay so animations finish.
    setTimeout(() => {
      renderAllPieces();
      clearLastMoveHighlight();
      applyLastMoveHighlight();
      clearCheckMateRings();
      applyCheckMateRings();
      setStatusDefault();
    }, 120);
  }

  function animateRookIfCastling(move, cell) {
    // chess.js flags for castling: 'k' king-side, 'q' queen-side (in verbose mode)
    // We detect by the specific from/to pattern instead (works without verbose).
    // White: e1 -> g1 (king-side), rook h1 -> f1
    // White: e1 -> c1 (queen-side), rook a1 -> d1
    // Black: e8 -> g8, rook h8 -> f8
    // Black: e8 -> c8, rook a8 -> d8
    const map = {
      'e1->g1': ['h1','f1'],
      'e1->c1': ['a1','d1'],
      'e8->g8': ['h8','f8'],
      'e8->c8': ['a8','d8']
    };
    const key = `${move.from}->${move.to}`;
    const pair = map[key];
    if (!pair) return;

    const [rFrom, rTo] = pair;
    // Find rook node that *was* at rFrom BEFORE move; after chess.js move, rook sits at rTo.
    // We’ll just re-place the rook node that is now at rTo.
    const rookNode =
      piecesLayer.querySelector(`.piece[data-square="${rFrom}"]`) ||
      piecesLayer.querySelector(`.piece[data-square="${rTo}"]`);

    if (rookNode) {
      rookNode.dataset.square = rTo;
      placePieceNode(rookNode, rTo, cell);
    }
  }

  // ----------------------------- Utilities -----------------------------------
  function ensureBoardContainer() {
    // If #board exists, use it; else create one at the top of body
    let n = el('#board');
    if (n) return n;
    n = document.createElement('div');
    n.id = 'board';
    n.className = 'board';
    document.body.prepend(n);

    // Add layers inside
    n.appendChild(makeLayer('squares'));
    n.appendChild(makeLayer('pieces'));
    return n;
  }

  function makeLayer(cls) {
    const d = document.createElement('div');
    d.className = cls;
    boardEl.appendChild(d);
    return d;
  }

  function ensureStatus() {
    // Create a status line if not present
    const s = document.createElement('div');
    s.id = 'status';
    s.className = 'status';
    s.textContent = '';
    document.body.appendChild(s);
    return s;
  }

  function onResize() {
    layoutBoard();
  }

  function currentCell() {
    const size = parseFloat(getComputedStyle(boardEl).getPropertyValue('--board-size')) ||
                 Math.min(boardEl.clientWidth, boardEl.clientHeight || boardEl.clientWidth);
    return size / 8;
  }

  function positionAllPieceNodes(cell) {
    $all('.piece').forEach(node => {
      const sq = node.dataset.square;
      if (sq) placePieceNode(node, sq, cell);
    });
  }

  function placePieceNode(node, square, cell) {
    const [x, y] = sqToXY(square);
    node.style.position = 'absolute';
    node.style.left = `${x * cell}px`;
    node.style.top = `${(7 - y) * cell}px`;
    node.style.width = `${cell}px`;
    node.style.height = `${cell}px`;
    node.style.lineHeight = `${cell}px`;
    node.style.fontSize = `${cell * 0.9}px`;
    node.style.transition = 'left 120ms ease, top 120ms ease';
  }

  function makePieceNode(p, square) {
    const d = document.createElement('div');
    d.className = `piece ${p.color === 'w' ? 'white' : 'black'}`;
    d.dataset.square = square;
    d.dataset.type = p.type;
    d.dataset.color = p.color;

    const span = document.createElement('span');
    span.textContent = unicodeFor(p);
    d.appendChild(span);
    return d;
  }

  function unicodeFor(p) {
    // Using standard chess unicode; you might already do this elsewhere.
    const map = {
      'wp':'♙','wr':'♖','wn':'♘','wb':'♗','wq':'♕','wk':'♔',
      'bp':'♟','br':'♜','bn':'♞','bb':'♝','bq':'♛','bk':'♚'
    };
    return map[p.color + p.type] || '?';
  }

  function sqToXY(square) {
    const file = square.charCodeAt(0) - 97; // 'a' -> 0
    const rank = parseInt(square[1], 10) - 1; // '1' -> 0
    return [file, rank];
  }
  function squareFromEvent(e) {
    const r = boardEl.getBoundingClientRect();
    const cell = currentCell();
    const x = Math.floor((e.clientX - r.left) / cell);
    const yFromTop = Math.floor((e.clientY - r.top) / cell);
  // Our board uses top-origin, ranks grow upward from bottom:
    const y = 7 - yFromTop;

    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return FILES[x] + (y + 1); // e.g., "e4"
}

  function squareEl(sq) {
    return document.querySelector(`.square[data-square="${sq}"]`);
  }

  function findKingSquare(color) {
    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = `${FILES[f]}${r}`;
        const p = game.get(sq);
        if (p && p.type === 'k' && p.color === color) return sq;
      }
    }
    return null;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }
  function setStatusDefault() {
    if (game.in_checkmate()) return; // handled above
    if (game.in_draw && game.in_draw()) { setStatus('Draw.'); return; }
    setStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move.`);
  }

  function flashIllegal(targetEl) {
    if (!targetEl) return;
    targetEl.classList.add('illegal');
    setTimeout(() => targetEl.classList.remove('illegal'), 160);
  }

  function openOverlay() {
    homeOverlay?.classList.remove('hidden');
    homeOverlay?.setAttribute('aria-hidden', 'false');
  }
  function closeOverlayFn() {
    homeOverlay?.classList.add('hidden');
    homeOverlay?.setAttribute('aria-hidden', 'true');
  }

  // ----------------------------- Expose (debug) ------------------------------
  window.nb = Object.assign(window.nb || {}, {
    rerenderEverything,
    applyCheckMateRings,
    showLegalTargets,
    clearLegalTargets
  });

})();
