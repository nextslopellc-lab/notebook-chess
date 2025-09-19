/* ============================================================================
  Notebook Chess — clean base (consolidated)
  - Plain JS, no frameworks. Uses window.Chess from libs/chess.mjs (loaded first).
  - Squares absolutely positioned; per-square colors; no gradients.
  - Pieces are .piece divs with <span> Unicode glyphs.
  - Tap-to-move, legal targets (pins respected via chess.js), castling via king.
  - Undo: Back button + ArrowLeft.
  - Highlights: last move (from & to), legal dots (center dot even on captures), check/mate ring.
  - Overlay: Menu / Resign, Continue / New Free Play
  - Optional logging hooks (window.nb.log)
============================================================================ */
(function () {
  /* ---------- tiny DOM helpers ---------- */
  function el(sel, root=document) { return root.querySelector(sel); }
  function $$ (sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

  /* ---------- constants & refs ---------- */
  const FILES = ['a','b','c','d','e','f','g','h'];

  const boardEl      = el('#board');
  const squaresLayer = el('.squares');
  const piecesLayer  = el('.pieces');

  const backBtn   = el('#backBtn');
  const menuBtn   = el('#menuBtn');
  const resignBtn = el('#resignBtn');

  const homeOverlay  = el('#homeOverlay');
  const closeOverlay = el('#closeOverlay');

  const statusEl = el('#status');

  // Force overlay hidden at boot (prevents it from catching clicks)
  if (homeOverlay) {
    homeOverlay.classList.add('hidden');
    homeOverlay.setAttribute('aria-hidden', 'true');
  }

  // chess.js constructor (defensive)
  var ChessCtor = window.Chess || window.ChessJS || window.ChessV2;
  if (!ChessCtor) {
    console.error('Chess library not found. Ensure libs/chess.mjs loads before app.js.');
    return;
  }

  /* ---------- game state ---------- */
  var game = new ChessCtor();
  window.game = game; // for console/debug

  var selectedFrom = null;   // "e2"
  var lastMove = null;       // {from, to}

  /* =========================================================================
     BOOT
  ========================================================================= */
  buildBoardIfNeeded();
  layoutBoard();
  renderAllPieces();
  applyLastMoveHighlight();
  applyCheckMateRings();
  setStatusDefault();

  // Clicks / resize
  (squaresLayer || boardEl).addEventListener('click', onBoardClick, false);
  window.addEventListener('resize', onResize, false);

  // Undo: Back button + ArrowLeft
  if (backBtn) backBtn.addEventListener('click', onUndo, false);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') onUndo();
  }, false);

  // Overlay wiring
  if (menuBtn)   menuBtn  .addEventListener('click', openOverlay, false);
  if (closeOverlay) closeOverlay.addEventListener('click', closeOverlayFn, false);
  if (resignBtn) resignBtn.addEventListener('click', function () {
    if (!confirm('Resign and return to menu?')) return;
    openOverlay();
  }, false);

  if (homeOverlay) {
    homeOverlay.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');

      if (action === 'continue-game') {
        closeOverlayFn();
        return;
      }

      if (action === 'free-play') {
        // new session for logs (optional)
        try { window.nb && window.nb.log && window.nb.log.startSession && window.nb.log.startSession('free-play'); } catch {}

        // reset game
        game = new ChessCtor();
        window.game = game;
        selectedFrom = null; lastMove = null;
        rerenderEverything();
        closeOverlayFn();
        return;
      }

      alert('Coming soon!');
    }, false);
  }

  function openOverlay(){
    if (!homeOverlay) return;
    homeOverlay.classList.remove('hidden');
    homeOverlay.setAttribute('aria-hidden', 'false');
  }
  function closeOverlayFn(){
    if (!homeOverlay) return;
    homeOverlay.classList.add('hidden');
    homeOverlay.setAttribute('aria-hidden', 'true');
  }

  /* =========================================================================
     EVENTS
  ========================================================================= */
  function onBoardClick(e) {
    // Try to hit a .square
    var sqEl = e.target && e.target.closest ? e.target.closest('.square') : null;
    var sq = sqEl && sqEl.dataset ? sqEl.dataset.square : null;

    // Fallback: math hit test (in case some overlay eats the click)
    if (!sq) {
      sq = squareFromEvent(e);
      if (sq) sqEl = squareEl(sq);
    }
    if (!sq) return;

    // No selection yet -> must touch own piece
    if (!selectedFrom) {
      var piece = game.get(sq);
      if (!piece || piece.color !== game.turn()) {
        flashIllegal(sqEl);
        statusFlash(turnText() + ' to move.', 900);
        return;
      }
      selectedFrom = sq;
      showLegalTargets(selectedFrom); // always on
      setStatus(pieceName(piece) + ' on ' + sq);
      return;
    }

    // Tapped same square -> cancel selection
    if (selectedFrom === sq) {
      selectedFrom = null;
      clearLegalTargets();
      setStatusDefault();
      return;
    }

    // Try to move
    var m = null;
    try {
      m = game.move({ from: selectedFrom, to: sq, promotion: 'q' });
    } catch (_) {
      m = null;
    }
    if (!m) {
      flashIllegal(sqEl);
      statusFlash('Illegal move', 900);
      return;
    }

    // Success
    selectedFrom = null;
    clearLegalTargets();
    animateAndSync(m);
  }

  function onUndo(){
    var undone = game.undo();
    if (!undone) { flashIllegal(boardEl); return; }
    selectedFrom = null;
    clearLegalTargets();
    rerenderEverything();

    // log undo (optional)
    try { window.nb && window.nb.log && window.nb.log.onUndo && window.nb.log.onUndo(game, undone); } catch {}
  }

  /* =========================================================================
     LAYOUT & RENDER
  ========================================================================= */
  function buildBoardIfNeeded(){
    if (!squaresLayer) return;
    if (squaresLayer.childElementCount === 64) return;
    squaresLayer.innerHTML = '';
    for (var rank = 8; rank >= 1; rank--){
      for (var f = 0; f < 8; f++){
        var file = FILES[f];
        var sq = file + rank;
        var isDark = (f + rank) % 2 === 0;
        var d = document.createElement('div');
        d.className = 'square ' + (isDark ? 'dark' : 'light');
        d.dataset.square = sq;
        squaresLayer.appendChild(d);
      }
    }
  }

  function layoutBoard(){
    var size = boardEl ? (Math.min(boardEl.clientWidth || 0, boardEl.clientHeight || 0) || boardEl.getBoundingClientRect().width) : 0;
    var cell = size / 8;

    // position squares
    if (squaresLayer) {
      var nodes = squaresLayer.children;
      for (var i = 0; i < nodes.length; i++){
        var node = nodes[i];
        var sq = node.dataset.square;
        var xy = sqToXY(sq);
        node.style.left   = (xy[0] * cell) + 'px';
        node.style.top    = ((7 - xy[1]) * cell) + 'px';
        node.style.width  = cell + 'px';
        node.style.height = cell + 'px';
      }
    }

    // position pieces + any visible dots
    positionAllPieceNodes(cell);
    positionAllDots(cell);
  }

  function renderAllPieces(){
    if (!piecesLayer) return;
    piecesLayer.innerHTML = '';
    var cell = currentCell();
    for (var rank = 1; rank <= 8; rank++){
      for (var f = 0; f < 8; f++){
        var file = FILES[f];
        var sq = file + rank;
        var p = game.get(sq);
        if (!p) continue;
        var node = makePieceNode(p, sq);
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

  /* =========================================================================
     LEGAL TARGET DOTS (overlay in pieces layer, above pieces)
     No CSS required; styled inline so capture squares also show a dot.
  ========================================================================= */
  function showLegalTargets(fromSq){
    clearLegalTargets();
    var moves = [];
    try { moves = game.moves({ square: fromSq, verbose:true }) || []; } catch(_){ moves = []; }
    var cell = currentCell();
    for (var i=0; i<moves.length; i++){
      var m = moves[i];
      var dot = document.createElement('div');
      dot.className = 'dot';
      dot.dataset.square = m.to;
      // style
      dot.style.position = 'absolute';
      dot.style.width = (cell * 0.26) + 'px';
      dot.style.height = (cell * 0.26) + 'px';
      dot.style.borderRadius = '50%';
      dot.style.background = '#000';
      dot.style.opacity = '0.9';
      dot.style.pointerEvents = 'none'; // don't block clicks
      placeDotNode(dot, m.to, cell);
      piecesLayer.appendChild(dot);
    }
  }
  function clearLegalTargets(){
    $$('.dot', piecesLayer).forEach(function(n){ n.remove(); });
  }
  function positionAllDots(cell){
    $$('.dot', piecesLayer).forEach(function(n){
      var sq = n.dataset.square;
      placeDotNode(n, sq, cell);
    });
  }
  function placeDotNode(node, square, cell){
    var xy = sqToXY(square);
    node.style.left = (xy[0] * cell + (cell*0.5) - (cell*0.13)) + 'px';
    node.style.top  = ((7 - xy[1]) * cell + (cell*0.5) - (cell*0.13)) + 'px';
  }

  /* =========================================================================
     HIGHLIGHTS
  ========================================================================= */
  function applyLastMoveHighlight(){
    if (!lastMove) return;
    squareEl(lastMove.from)?.classList.add('last-from');
    squareEl(lastMove.to)?.classList.add('last-to');
  }
  function clearLastMoveHighlight(){
    $$('.square.last-from').forEach(function(n){ n.classList.remove('last-from'); });
    $$('.square.last-to').forEach(function(n){ n.classList.remove('last-to'); });
  }

  function applyCheckMateRings(){
    clearCheckMateRings();
    // support both API spellings across chess.js versions
    var inCheckmate = (typeof game.in_checkmate === 'function') ? game.in_checkmate() :
                      (typeof game.isCheckmate   === 'function') ? game.isCheckmate() : false;
    var inCheck     = (typeof game.in_check     === 'function') ? game.in_check()     :
                      (typeof game.isCheck      === 'function') ? game.isCheck()      : false;

    if (inCheckmate){
      var mated = game.turn(); // side to move is mated
      var ksq = findKingSquare(mated);
      if (ksq) squareEl(ksq)?.classList.add('mate');
      setStatus('Checkmate.');
      return;
    }
    if (inCheck){
      var side = game.turn();
      var ksq2 = findKingSquare(side);
      if (ksq2) squareEl(ksq2)?.classList.add('check');
      setStatus('Check.');
      return;
    }
  }
  function clearCheckMateRings(){
    $$('.square.check').forEach(function(n){ n.classList.remove('check'); });
    $$('.square.mate').forEach(function(n){ n.classList.remove('mate'); });
  }

  /* =========================================================================
     MOVES & ANIMATION
  ========================================================================= */
  function animateAndSync(move){
    // record last move
    lastMove = { from: move.from, to: move.to };

    var cell = currentCell();

    // handle rook animation on castling
    try {
      if (typeof move.isKingsideCastle === 'function' && move.isKingsideCastle()){
        var rf = (move.color === 'w') ? 'h1' : 'h8';
        var rt = (move.color === 'w') ? 'f1' : 'f8';
        var rook = piecesLayer.querySelector('.piece[data-square="' + rf + '"]');
        if (rook) { rook.dataset.square = rt; placePieceNode(rook, rt, cell); }
      } else if (typeof move.isQueensideCastle === 'function' && move.isQueensideCastle()){
        var rfq = (move.color === 'w') ? 'a1' : 'a8';
        var rtq = (move.color === 'w') ? 'd1' : 'd8';
        var rookq = piecesLayer.querySelector('.piece[data-square="' + rfq + '"]');
        if (rookq) { rookq.dataset.square = rtq; placePieceNode(rookq, rtq, cell); }
      }
    } catch(_) {}

    // move the piece node
    var nowAtTo = game.get(move.to);
    var movedNode =
      piecesLayer.querySelector('.piece[data-square="' + move.from + '"]') ||
      null;

    if (movedNode && nowAtTo){
      movedNode.dataset.square = move.to;
      movedNode.dataset.type   = nowAtTo.type;
      movedNode.dataset.color  = nowAtTo.color;
      movedNode.querySelector('span').textContent = unicodeFor(nowAtTo);
      placePieceNode(movedNode, move.to, cell);
    }

    // log move (optional)
    try { window.nb && window.nb.log && window.nb.log.onMove && window.nb.log.onMove(game, move); } catch {}

    // re-render to sync captures/highlights
    setTimeout(function(){
      renderAllPieces();
      clearLastMoveHighlight();
      applyLastMoveHighlight();
      clearCheckMateRings();
      applyCheckMateRings();
      setStatusDefault();
    }, 120);
  }

  /* =========================================================================
     UTILITIES
  ========================================================================= */
  function onResize(){ layoutBoard(); }

  function currentCell(){
    var size = boardEl ? (Math.min(boardEl.clientWidth || 0, boardEl.clientHeight || 0) || boardEl.getBoundingClientRect().width) : 0;
    return size / 8;
  }

  function positionAllPieceNodes(cell){
    $$('.piece', piecesLayer).forEach(function(node){
      var sq = node.dataset.square;
      if (sq) placePieceNode(node, sq, cell);
    });
  }

  function placePieceNode(node, square, cell){
    var xy = sqToXY(square);
    node.style.left      = (xy[0] * cell) + 'px';
    node.style.top       = ((7 - xy[1]) * cell) + 'px';
    node.style.width     = cell + 'px';
    node.style.height    = cell + 'px';
    node.style.lineHeight= cell + 'px';
    node.style.fontSize  = (cell * 0.9) + 'px';
  }

  function makePieceNode(p, square){
    var d = document.createElement('div');
    d.className = 'piece ' + (p.color === 'w' ? 'white' : 'black');
    d.dataset.square = square;
    d.dataset.type   = p.type;
    d.dataset.color  = p.color;
    var span = document.createElement('span');
    span.textContent = unicodeFor(p);
    d.appendChild(span);
    // NOTE: .piece has pointer-events:none in CSS so clicks go to .square
    return d;
  }

  function unicodeFor(p){
    var map = {
      'wp':'♙','wr':'♖','wn':'♘','wb':'♗','wq':'♕','wk':'♔',
      'bp':'♟','br':'♜','bn':'♞','bb':'♝','bq':'♛','bk':'♚'
    };
    return map[p.color + p.type] || '?';
  }

  function sqToXY(square){
    var file = square.charCodeAt(0) - 97; // 'a'->0
    var rank = parseInt(square[1],10) - 1; // '1'->0
    return [file, rank];
  }

  function squareEl(sq){ return document.querySelector('.square[data-square="' + sq + '"]'); }

  function squareFromEvent(e){
    var r = boardEl.getBoundingClientRect();
    var cell = currentCell();
    var x = Math.floor((e.clientX - r.left) / cell);
    var yFromTop = Math.floor((e.clientY - r.top) / cell);
    var y = 7 - yFromTop;
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return FILES[x] + (y + 1);
  }

  function findKingSquare(color){
    for (var r = 1; r <= 8; r++){
      for (var f = 0; f < 8; f++){
        var sq = FILES[f] + r;
        var p = game.get(sq);
        if (p && p.type === 'k' && p.color === color) return sq;
      }
    }
    return null;
  }

  function setStatus(text){ if (statusEl) statusEl.textContent = text || ''; }
  function turnText(){ return game.turn() === 'w' ? 'White' : 'Black'; }
  function setStatusDefault(){
    if (typeof game.in_checkmate === 'function' && game.in_checkmate()) return; // already set “Checkmate.”
    if (typeof game.isCheckmate   === 'function' && game.isCheckmate()) return;
    if ((game.in_draw && game.in_draw()) || (game.isDraw && game.isDraw())) { setStatus('Draw.'); return; }
    setStatus(turnText() + ' to move.');
  }
  function statusFlash(msg, ms){
    setStatus(msg);
    clearTimeout(statusFlash._t);
    statusFlash._t = setTimeout(setStatusDefault, ms || 900);
  }

  function pieceName(p){
    var n={p:'Pawn',r:'Rook',n:'Knight',b:'Bishop',q:'Queen',k:'King'};
    return n[p && p.type]||'?';
  }

  function flashIllegal(targetEl){
    if (!targetEl) return;
    targetEl.classList.add('illegal');
    setTimeout(function(){ targetEl.classList.remove('illegal'); }, 160);
  }
})();
