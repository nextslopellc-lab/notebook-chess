/* ============================================================================
  Notebook Chess - Phase 1 (clean base)
  - Plain JS, no frameworks. Uses window.Chess from libs/chess.mjs.
  - Squares are absolutely positioned; per-square colors; no gradients.
  - Pieces are .piece divs with <span> Unicode glyphs.
  - Input: tap-to-move, legal targets (pins respected), castling via king.
  - Undo: Back button + ArrowLeft.
  - Highlights: last move (from & to), legal dots, check/mate ring.
  - No service worker. No CDNs. All local.
============================================================================ */
(function () {

  /* ---------- tiny DOM helpers ---------- */
  function el(sel, root=document) { return root.querySelector(sel); }
  function $all(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

  /* ---------- constants & refs ---------- */
  const FILES = ['a','b','c','d','e','f','g','h'];

  const boardEl = el('#board');
  const squaresLayer = el('.squares');
  const piecesLayer  = el('.pieces');

  const backBtn   = el('#backBtn');
  const menuBtn   = el('#menuBtn');
  const resignBtn = el('#resignBtn');

  const homeOverlay  = el('#homeOverlay');
  const closeOverlay = el('#closeOverlay');

// Force hidden on boot (prevents overlay from blocking clicks)
  homeOverlay?.classList.add('hidden');
  homeOverlay?.setAttribute('aria-hidden', 'true');


  const statusEl = el('#status');

  const ChessCtor = window.Chess;
  if (typeof ChessCtor !== 'function') {
    console.error('Chess library not available yet.');
    document.getElementById('status')?.textContent = 'Error: failed to load chess library.';
    return; // stop boot so we don’t crash before building the board
  }
  let game = new ChessCtor();
  window.game = game; // expose for console/debug


  /* ---------- selection & last-move ---------- */
  let selectedFrom = null;       // "e2"
  let lastMove = null;           // {from, to}

  /* ---------- boot ---------- */
  buildBoardIfNeeded();
  layoutBoard();
  renderAllPieces();
  applyLastMoveHighlight();
  applyCheckMateRings();
  setStatusDefault();

  // Robust click handling (works even if piece layer sits above)
  boardEl.addEventListener('click', onBoardClick, { passive:true });
  window.addEventListener('resize', onResize, { passive:true });

  // Undo
  backBtn?.addEventListener('click', onUndo);
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowLeft') onUndo();
  });

  // Overlay controls
  menuBtn?.addEventListener('click', openOverlay);
  closeOverlay?.addEventListener('click', closeOverlayFn);
  resignBtn?.addEventListener('click', () => {
    if (!confirm('Resign and return to menu?')) return;
    openOverlay();
  });
  homeOverlay?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'continue-game') {
      closeOverlayFn();
    } else if (action === 'free-play') {
      game = new Chess();
      window.game = game;
      selectedFrom = null; lastMove = null;
      rerenderEverything();
      closeOverlayFn();
    } else {
      alert('Coming soon!');
    }
  });
  
function openOverlay(){
  homeOverlay?.classList.remove('hidden');
  homeOverlay?.setAttribute('aria-hidden', 'false');
}
function closeOverlayFn(){
  homeOverlay?.classList.add('hidden');
  homeOverlay?.setAttribute('aria-hidden', 'true');
}

  /* ---------- events ---------- */
  function onBoardClick(e){
    // Try direct hit to a .square
    let sqEl = e.target.closest?.('.square');
    let sq = sqEl?.dataset?.square;

    // Fallback to math hit-test if click landed elsewhere (e.g., piece layer)
    if (!sq) {
      sq = squareFromEvent(e);
      if (sq) sqEl = squareEl(sq);
    }
    if (!sq) return;

    // No selection yet → select if piece of side-to-move
    if (!selectedFrom) {
      const piece = game.get(sq);
      if (!piece || piece.color !== game.turn()) {
        flashIllegal(sqEl);
        statusFlash(`${turnText()} to move.`, 900);
        return;
      }
      selectedFrom = sq;
      showLegalTargets(selectedFrom);   // always on
      setStatus(`${pieceName(piece)} on ${sq}`);
      return;
    }

    // Tapped same square → cancel selection
    if (selectedFrom === sq) {
      selectedFrom = null;
      clearLegalTargets();
      setStatusDefault();
      return;
    }

    // Attempt the move
    const m = game.move({ from:selectedFrom, to:sq, promotion:'q' });
    if (!m) {
      flashIllegal(sqEl);
      statusFlash('Illegal move', 900);
      return;
    }

    selectedFrom = null;
    clearLegalTargets();
    animateAndSync(m);
  }

  function onUndo(){
    const undone = game.undo();
    if (!undone) { flashIllegal(boardEl); return; }
    selectedFrom = null;
    clearLegalTargets();
    rerenderEverything();
  }

  /* ---------- layout & render ---------- */
  function buildBoardIfNeeded(){
    if (squaresLayer.childElementCount === 64) return;
    squaresLayer.innerHTML = '';
    for (let rank = 8; rank >= 1; rank--){
      for (let f = 0; f < 8; f++){
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

  function layoutBoard(){
    const size = Math.min(boardEl.clientWidth || 0, boardEl.clientHeight || 0) || boardEl.getBoundingClientRect().width;
    const cell = size / 8;
    // Place squares
    const nodes = squaresLayer.children;
    for (let i = 0; i < nodes.length; i++){
      const sqEl = nodes[i];
      const { square } = sqEl.dataset;
      const [x, y] = sqToXY(square);
      sqEl.style.left = `${x * cell}px`;
      sqEl.style.top  = `${(7 - y) * cell}px`;
      sqEl.style.width  = `${cell}px`;
      sqEl.style.height = `${cell}px`;
    }
    // Place current pieces
    positionAllPieceNodes(cell);
    positionAllDots(cell);
  }

  function renderAllPieces(){
    piecesLayer.innerHTML = '';
    const cell = currentCell();
    for (let rank = 1; rank <= 8; rank++){
      for (let f = 0; f < 8; f++){
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

  function rerenderEverything(){
    clearLastMoveHighlight();
    clearCheckMateRings();
    renderAllPieces();
    applyLastMoveHighlight();
    applyCheckMateRings();
    setStatusDefault();
  }

  /* ---------- highlights ---------- */
  function showLegalTargets(fromSq){
  clearLegalTargets();
  const moves = game.moves({ square: fromSq, verbose:true }) || [];
  const cell = currentCell();

  for (const m of moves){
    const to = m.to;
    // Keep the .target class for semantics/back-compat
    squareEl(to)?.classList.add('target');

    // If the target square is currently occupied, draw an overlay dot above the piece
    if (game.get(to)){
      const dot = document.createElement('div');
      dot.className = 'legal-dot';
      dot.dataset.square = to;
      placeDotAt(dot, to, cell);
      piecesLayer.appendChild(dot); // sits above pieces
    }
  }
}

function clearLegalTargets(){
  $all('.square.target').forEach(n => n.classList.remove('target'));
  $all('.legal-dot', piecesLayer).forEach(n => n.remove());
}


  function applyLastMoveHighlight(){
    if (!lastMove) return;
    squareEl(lastMove.from)?.classList.add('last-from');
    squareEl(lastMove.to)?.classList.add('last-to');
  }
  function clearLastMoveHighlight(){
    $all('.square.last-from').forEach(n => n.classList.remove('last-from'));
    $all('.square.last-to').forEach(n => n.classList.remove('last-to'));
  }

function applyCheckMateRings(){
  clearCheckMateRings();
  if (game.isCheckmate && game.isCheckmate()){
    const ksq = findKingSquare(game.turn());
    if (ksq) squareEl(ksq)?.classList.add('mate');
    setStatus('Checkmate.');
    return;
  }
  if (game.isCheck && game.isCheck()){
    const ksq = findKingSquare(game.turn());
    if (ksq) squareEl(ksq)?.classList.add('check');
    setStatus('Check.');
  }
}
  
  function clearCheckMateRings(){
    $all('.square.check').forEach(n => n.classList.remove('check'));
    $all('.square.mate').forEach(n => n.classList.remove('mate'));
  }

  /* ---------- moves & animation ---------- */
  function animateAndSync(move){
    // Record last move for highlight
    lastMove = { from: move.from, to: move.to };

    const cell = currentCell();

    // Handle rook motion for castling
    animateRookIfCastling(move, cell);

    // Update moved piece node to the new square (and glyph, for promotions)
    const nowAtTo = game.get(move.to);
    const movedNode =
      piecesLayer.querySelector(`.piece[data-square="${move.from}"]`) ||
      makePieceNode(nowAtTo, move.from);

    if (movedNode && nowAtTo){
      movedNode.dataset.square = move.to;
      movedNode.dataset.type = nowAtTo.type;
      movedNode.dataset.color = nowAtTo.color;
      movedNode.querySelector('span').textContent = unicodeFor(nowAtTo);
      placePieceNode(movedNode, move.to, cell);
    }

    // Re-render to clean up captures and sync classes after small delay
    setTimeout(() => {
      renderAllPieces();
      clearLastMoveHighlight();
      applyLastMoveHighlight();
      clearCheckMateRings();
      applyCheckMateRings();
      setStatusDefault();
    }, 120);
  }

  function animateRookIfCastling(move, cell){
    const map = {
      'e1->g1': ['h1','f1'],
      'e1->c1': ['a1','d1'],
      'e8->g8': ['h8','f8'],
      'e8->c8': ['a8','d8']
    };
    const k = `${move.from}->${move.to}`;
    const pair = map[k];
    if (!pair) return;
    const [rFrom, rTo] = pair;
    const rookNode =
      piecesLayer.querySelector(`.piece[data-square="${rFrom}"]`) ||
      piecesLayer.querySelector(`.piece[data-square="${rTo}"]`);
    if (rookNode){
      rookNode.dataset.square = rTo;
      placePieceNode(rookNode, rTo, cell);
    }
  }

  /* ---------- utilities ---------- */
  function onResize(){ layoutBoard(); }

  function currentCell(){
    const size = Math.min(boardEl.clientWidth || 0, boardEl.clientHeight || 0) || boardEl.getBoundingClientRect().width;
    return size / 8;
  }

  function positionAllPieceNodes(cell){
    $all('.piece').forEach(node => {
      const sq = node.dataset.square;
      if (sq) placePieceNode(node, sq, cell);
    });
  }

  function placePieceNode(node, square, cell){
    const [x, y] = sqToXY(square);
    node.style.left = `${x * cell}px`;
    node.style.top  = `${(7 - y) * cell}px`;
    node.style.width = `${cell}px`;
    node.style.height = `${cell}px`;
    node.style.lineHeight = `${cell}px`;
    node.style.fontSize = `${cell * 0.9}px`;
  }
 
  function placeDotAt(node, square, cell){
    const [x, y] = sqToXY(square);
    node.style.left = `${(x + 0.5) * cell}px`;
    node.style.top  = `${(7 - y + 0.5) * cell}px`;
    const d = cell * 0.26;   // dot size (26% of a cell)
    node.style.width  = `${d}px`;
    node.style.height = `${d}px`;
  }

function positionAllDots(cell){
  $all('.legal-dot', piecesLayer).forEach(node => {
    const sq = node.dataset.square;
    if (sq) placeDotAt(node, sq, cell);
  });
}

  function makePieceNode(p, square){
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

  function unicodeFor(p){
    const map = {
      'wp':'♙','wr':'♖','wn':'♘','wb':'♗','wq':'♕','wk':'♔',
      'bp':'♟','br':'♜','bn':'♞','bb':'♝','bq':'♛','bk':'♚'
    };
    return map[p.color + p.type] || '?';
  }

  function sqToXY(square){
    const file = square.charCodeAt(0) - 97; // 'a'->0
    const rank = parseInt(square[1],10) - 1; // '1'->0
    return [file, rank];
  }

  function squareEl(sq){ return document.querySelector(`.square[data-square="${sq}"]`); }

  function squareFromEvent(e){
    const r = boardEl.getBoundingClientRect();
    const cell = currentCell();
    const x = Math.floor((e.clientX - r.left) / cell);
    const yFromTop = Math.floor((e.clientY - r.top) / cell);
    const y = 7 - yFromTop;
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return FILES[x] + (y + 1);
  }

  function findKingSquare(color){
    for (let r = 1; r <= 8; r++){
      for (let f = 0; f < 8; f++){
        const sq = `${FILES[f]}${r}`;
        const p = game.get(sq);
        if (p && p.type === 'k' && p.color === color) return sq;
      }
    }
    return null;
  }

  function setStatus(text){ if (statusEl) statusEl.textContent = text || ''; }
  function turnText(){ return game.turn() === 'w' ? 'White' : 'Black'; }
  
  function setStatusDefault(){
    if (game.isCheckmate && game.isCheckmate()) return; // already set “Checkmate.”
    if (game.isDraw && game.isDraw()) { setStatus('Draw.'); return; }
    setStatus(`${turnText()} to move.`);
  }
  
  function statusFlash(msg, ms=900){
    setStatus(msg);
    clearTimeout(statusFlash._t);
    statusFlash._t = setTimeout(setStatusDefault, ms);
  }

  function pieceName(p){
    const n={p:'Pawn',r:'Rook',n:'Knight',b:'Bishop',q:'Queen',k:'King'};
    return n[p?.type]||'?';
  }

  function flashIllegal(targetEl){
    if (!targetEl) return;
    targetEl.classList.add('illegal');
    setTimeout(()=>targetEl.classList.remove('illegal'), 160);
  }

})();
