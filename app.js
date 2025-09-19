/* ============================================================================
  Notebook Chess - Stable Baseline (no engine)
  - Plain JS, no frameworks. Uses window.Chess from libs/chess.mjs (index.html).
  - Absolute-positioned squares; Unicode pieces (DOM: .piece > span).
  - Input: tap-to-move; legal targets rendered as CENTER DOTS in the pieces layer,
    so dots are visible on empty AND occupied squares.
  - UX: last-move highlight; check/mate ring; status messages; undo/back.
  - Overlay menu: Continue / New Free Play (others TBD).
  - No optional chaining; no service worker; all local.
============================================================================ */
(function () {
  /* ---------- tiny DOM helpers ---------- */
  function el(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /* ---------- constants ---------- */
  var FILES = ['a','b','c','d','e','f','g','h'];

  /* ---------- refs ---------- */
  var boardEl      = el('#board');
  var squaresLayer = el('.squares');
  var piecesLayer  = el('.pieces');

  var backBtn   = el('#backBtn');
  var menuBtn   = el('#menuBtn');
  var resignBtn = el('#resignBtn');

  var homeOverlay  = el('#homeOverlay');
  var closeOverlay = el('#closeOverlay');

  // Prevent overlay from blocking clicks on first paint
  if (homeOverlay) {
    homeOverlay.classList.add('hidden');
    homeOverlay.setAttribute('aria-hidden', 'true');
  }

  var statusEl = el('#status');

  /* ---------- chess lib guard ---------- */
  var ChessCtor = window.Chess;
  if (typeof ChessCtor !== 'function') {
    if (statusEl) statusEl.textContent = 'Error: chess library failed to load.';
    console.error('Chess library not available. Ensure libs/chess.mjs loads before app.js.');
    return;
  }

  /* ---------- state ---------- */
  var game = new ChessCtor();
  window.game = game; // console / debugging

  var selectedFrom = null; // "e2"
  var lastMove = null;     // { from, to }

  /* =========================================================================
     BOOT
  ========================================================================= */
  buildBoardIfNeeded();
  layoutBoard();
  renderAllPieces();
  applyLastMoveHighlight();
  applyCheckMateRings();
  setStatusDefault();

  // clicks/resize
  (squaresLayer || boardEl).addEventListener('click', onBoardClick, false);
  window.addEventListener('resize', onResize, false);

  // undo: Back button + ArrowLeft
  if (backBtn) backBtn.addEventListener('click', onUndo, false);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') onUndo();
  }, false);

  // overlay wiring
  if (menuBtn)   menuBtn.addEventListener('click', openOverlay,  false);
  if (closeOverlay) closeOverlay.addEventListener('click', closeOverlayFn, false);
  if (resignBtn) resignBtn.addEventListener('click', function () {
    if (!confirm('Resign and return to menu?')) return;
    openOverlay();
  }, false);

  if (homeOverlay) {
   homeOverlay?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.getAttribute('data-action');

  if (action === 'continue-game') {
    closeOverlayFn();
    return;
  }

  if (action === 'free-play') {
    game = new Chess();
    window.game = game;
    selectedFrom = null;
    lastMove = null;
    rerenderEverything();

    // start a new logging session
    window.nb?.log?.startSession?.('free-play');

    closeOverlayFn();
    return;
  }

  alert('Coming soon!');
});


  // Notebook: start a fresh session/game if available
  if (window.nb && window.nb.state && typeof window.nb.state.reset === 'function') {
    try { window.nb.state.reset(); } catch(e) {}
  }
  if (window.nb && window.nb.log && typeof window.nb.log.onNewGame === 'function') {
    try { window.nb.log.onNewGame(); } catch(e) {}
  }

  game = new ChessCtor();
  window.game = game;
  selectedFrom = null; lastMove = null;
  rerenderEverything();
  closeOverlayFn();
} else {
        alert('Coming soon!');
      }
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
    try { m = game.move({ from: selectedFrom, to: sq, promotion: 'q' }); } catch (_) { m = null; }

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
  const undone = game.undo();
  if (!undone) { flashIllegal(boardEl); return; }

  selectedFrom = null;
  clearLegalTargets();
  rerenderEverything();

  // log the undo (uses your current API: window.nb.log)
  try { window.nb && window.nb.log && window.nb.log.onUndo(game, undone); } catch {}
}


  selectedFrom = null;
  clearLegalTargets();
  rerenderEverything();
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
     - No CSS required; styled inline so capture squares also show a dot.
  ========================================================================= */
  function showLegalTargets(fromSq){
    clearLegalTargets();
    var moves = game.moves({ square: fromSq, verbose: true }) || [];
    var cell = currentCell();
    for (var i = 0; i < moves.length; i++){
      var to = moves[i].to;
      var dot = document.createElement('div');
      dot.className = 'legal-dot';
      dot.dataset.square = to;

      // inline style (keeps styles.css unchanged)
      dot.style.position = 'absolute';
      dot.style.zIndex = '4';
      dot.style.borderRadius = '50%';
      dot.style.background = '#000';
      dot.style.opacity = '0.9';
      dot.style.pointerEvents = 'none';
      // size/position
      placeDotAt(dot, to, cell);

      piecesLayer.appendChild(dot);
    }
  }
  function clearLegalTargets(){
    var dots = $all('.legal-dot', piecesLayer);
    for (var i = 0; i < dots.length; i++) dots[i].remove();
  }
  function placeDotAt(node, square, cell){
    var xy = sqToXY(square);
    node.style.left = ((xy[0] + 0.5) * cell) + 'px';
    node.style.top  = ((7 - xy[1] + 0.5) * cell) + 'px';
    var d = cell * 0.26;
    node.style.width = d + 'px';
    node.style.height = d + 'px';
    node.style.transform = 'translate(-50%, -50%)';
  }
  function positionAllDots(cell){
    var nodes = $all('.legal-dot', piecesLayer);
    for (var i = 0; i < nodes.length; i++){
      var sq = nodes[i].dataset.square;
      placeDotAt(nodes[i], sq, cell);
    }
  }

  /* =========================================================================
     MOVES / ANIMATION / HIGHLIGHTS
  ========================================================================= */
  function animateAndSync(move){
    // record last move
    lastMove = { from: move.from, to: move.to };

    // Notebook: log this move (safe if nb is missing)
if (window.nb && window.nb.log && typeof window.nb.log.onMove === 'function') {
  try { window.nb.log.onMove(move, game); } catch(e) { console.warn('nb.log.onMove failed', e); }
}

    var cell = currentCell();

    // if capture, remove captured node first so animation looks clean
    var capturedNode = piecesLayer.querySelector('.piece[data-square="' + move.to + '"]');
    if (capturedNode) capturedNode.remove();

    // handle castling rook animation (where supported on current chess.js)
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

    // move the piece node (CSS transition handles smoothness)
    var movedNode = piecesLayer.querySelector('.piece[data-square="' + move.from + '"]');
    var nowAtTo = game.get(move.to); // after game.move, board is updated
    if (movedNode && nowAtTo){
      movedNode.dataset.square = move.to;
      movedNode.dataset.type   = nowAtTo.type;
      movedNode.dataset.color  = nowAtTo.color;
      var span = movedNode.querySelector('span');
      if (span) span.textContent = unicodeFor(nowAtTo);
      placePieceNode(movedNode, move.to, cell);
    }

    // small delay: resync pieces + highlights (promotion/EP etc.)
    setTimeout(function(){
      renderAllPieces();
      clearLastMoveHighlight();
      applyLastMoveHighlight();
      clearCheckMateRings();
      applyCheckMateRings();
      setStatusDefault();
    }, 120);
  }

  // last-move highlight
  function applyLastMoveHighlight(){
    if (!lastMove) return;
    var a = squareEl(lastMove.from); if (a) a.classList.add('last-from');
    var b = squareEl(lastMove.to);   if (b) b.classList.add('last-to');
  }
  function clearLastMoveHighlight(){
    var a = $all('.square.last-from'); for (var i=0;i<a.length;i++) a[i].classList.remove('last-from');
    var b = $all('.square.last-to');   for (var j=0;j<b.length;j++) b[j].classList.remove('last-to');
  }

  // check / mate rings
  function applyCheckMateRings(){
    clearCheckMateRings();
    var inMate  = (typeof game.isCheckmate === 'function') ? game.isCheckmate() : (game.in_checkmate ? game.in_checkmate() : false);
    var inCheck = (typeof game.isCheck     === 'function') ? game.isCheck()     : (game.in_check     ? game.in_check()     : false);

    if (inMate){
      var matedColor = game.turn(); // side to move is mated
      var ksqM = findKingSquare(matedColor);
      if (ksqM) { var mEl = squareEl(ksqM); if (mEl) mEl.classList.add('mate'); }
      setStatus('Checkmate.');
      return;
    }
    if (inCheck){
      var side = game.turn();
      var ksq = findKingSquare(side);
      if (ksq) { var cEl = squareEl(ksq); if (cEl) cEl.classList.add('check'); }
      setStatus('Check.');
      return;
    }
  }
  function clearCheckMateRings(){
    var c = $all('.square.check'); for (var i=0;i<c.length;i++) c[i].classList.remove('check');
    var m = $all('.square.mate');  for (var j=0;j<m.length;j++) m[j].classList.remove('mate');
  }

  /* =========================================================================
     LAYOUT UTILS
  ========================================================================= */
  function onResize(){ layoutBoard(); }

  function currentCell(){
    var size = boardEl ? (Math.min(boardEl.clientWidth || 0, boardEl.clientHeight || 0) || boardEl.getBoundingClientRect().width) : 0;
    return size / 8;
  }

  function positionAllPieceNodes(cell){
    var nodes = $all('.piece', piecesLayer);
    for (var i = 0; i < nodes.length; i++){
      var sq = nodes[i].dataset.square;
      if (sq) placePieceNode(nodes[i], sq, cell);
    }
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

  /* =========================================================================
     STATUS / UX
  ========================================================================= */
  function setStatus(text){ if (statusEl) statusEl.textContent = text || ''; }
  function turnText(){ return game.turn() === 'w' ? 'White' : 'Black'; }
  function setStatusDefault(){
    // honor any previous explicit "Checkmate." set by applyCheckMateRings()
    var inMate = (typeof game.isCheckmate === 'function') ? game.isCheckmate() : (game.in_checkmate ? game.in_checkmate() : false);
    if (inMate) return;
    if (typeof game.isDraw === 'function' ? game.isDraw() : (game.in_draw && game.in_draw())) {
      setStatus('Draw.');
      return;
    }
    setStatus(turnText() + ' to move.');
  }
  function statusFlash(msg, ms){
    setStatus(msg);
    clearTimeout(statusFlash._t);
    statusFlash._t = setTimeout(setStatusDefault, ms || 900);
  }

  function pieceName(p){
    var n={p:'Pawn',r:'Rook',n:'Knight',b:'Bishop',q:'Queen',k:'King'};
    return n[p && p.type] || '?';
  }

  function flashIllegal(targetEl){
    if (!targetEl) return;
    targetEl.classList.add('illegal');
    setTimeout(function(){ targetEl.classList.remove('illegal'); }, 160);
  }
})();
