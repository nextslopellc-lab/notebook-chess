/* ============================================================================
  Notebook Chess - Baseline (stable dev)
  - Plain JS, no frameworks. Uses window.Chess set by index.html loader.
  - Absolute-positioned squares; Unicode pieces.
  - Tap-to-move; legal targets rendered as CENTER DOTS over the pieces layer,
    so dots are visible on empty AND occupied squares.
  - Last-move highlights; check/mate ring; undo; status messages.
  - No optional chaining (old parsers choke on it). No service worker. No CDNs.
============================================================================ */
(function () {
  // ---------- tiny DOM helpers ----------
  function el(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // ---------- constants ----------
  var FILES = ['a','b','c','d','e','f','g','h'];

  // ---------- refs ----------
  var boardEl      = el('#board');
  var squaresLayer = el('.squares');
  var piecesLayer  = el('.pieces');

  var backBtn   = el('#backBtn');
  var menuBtn   = el('#menuBtn');
  var resignBtn = el('#resignBtn');

  var homeOverlay  = el('#homeOverlay');
  var closeOverlay = el('#closeOverlay');
  if (homeOverlay) { homeOverlay.classList.add('hidden'); homeOverlay.setAttribute('aria-hidden', 'true'); }

  var statusEl = el('#status');

  // ---------- chess lib guard ----------
  var ChessCtor = window.Chess;
  if (typeof ChessCtor !== 'function') {
    if (statusEl) statusEl.textContent = 'Error: chess library failed to load.';
    console.error('Chess library not available.');
    return;
  }
  var game = new ChessCtor();
  window.game = game; // for console/debug

  // ---------- selection & last-move ----------
  var selectedFrom = null;      // "e2"
  var lastMove = null;          // { from, to }

  // ---------- boot ----------
  buildBoardIfNeeded();
  layoutBoard();
  renderAllPieces();
  applyLastMoveHighlight();
  applyCheckMateRings();
  setStatusDefault();

  // robust click handling: listen on squares layer
  (squaresLayer || boardEl).addEventListener('click', onBoardClick, false);
  window.addEventListener('resize', onResize, false);

  // Undo (button + ArrowLeft)
  if (backBtn) backBtn.addEventListener('click', onUndo, false);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') onUndo();
  }, false);

  // Overlay/menu wiring (simple, non-blocking)
  if (menuBtn) menuBtn.addEventListener('click', openOverlay, false);
  if (closeOverlay) closeOverlay.addEventListener('click', closeOverlayFn, false);
  if (resignBtn) resignBtn.addEventListener('click', function () {
    if (!confirm('Resign and return to menu?')) return;
    openOverlay();
  }, false);
  if (homeOverlay) homeOverlay.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'continue-game') {
      closeOverlayFn();
    } else if (action === 'free-play') {
      game = new ChessCtor();
      window.game = game;
      selectedFrom = null; lastMove = null;
      rerenderEverything();
      closeOverlayFn();
    } else {
      alert('Coming soon!');
    }
  }, false);

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

  // ---------- events ----------
  function onBoardClick(e) {
    // hit-test for .square
    var sqEl = e.target && e.target.closest ? e.target.closest('.square') : null;
    var sq = sqEl && sqEl.dataset ? sqEl.dataset.square : null;

    if (!sq) {
      // fallback: math hit-test if somehow missed squares layer
      sq = squareFromEvent(e);
      if (sq) sqEl = squareEl(sq);
    }
    if (!sq) return;

    // no selection -> select own piece
    if (!selectedFrom) {
      var piece = game.get(sq);
      if (!piece || piece.color !== game.turn()) {
        flashIllegal(sqEl);
        statusFlash(turnText() + ' to move.', 900);
        return;
      }
      selectedFrom = sq;
      showLegalTargets(selectedFrom);
      setStatus(pieceName(piece) + ' on ' + sq);
      return;
    }

    // tapped same square -> cancel
    if (selectedFrom === sq) {
      selectedFrom = null;
      clearLegalTargets();
      setStatusDefault();
      return;
    }

    // attempt move
    var m = null;
    try {
      m = game.move({ from: selectedFrom, to: sq, promotion: 'q' });
    } catch (_) { m = null; }

    if (!m) {
      flashIllegal(sqEl);
      statusFlash('Illegal move', 900);
      return;
    }

    // success
    selectedFrom = null;
    clearLegalTargets();
    animateAndSync(m);
  }

  function onUndo() {
    var undone = game.undo();
    if (!undone) { flashIllegal(boardEl); return; }
    selectedFrom = null;
    clearLegalTargets();
    rerenderEverything();
  }

  // ---------- layout & render ----------
  function buildBoardIfNeeded(){
    if (squaresLayer && squaresLayer.childElementCount === 64) return;
    if (!squaresLayer) return;
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
    // place squares
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
    // place pieces + dots
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

  // ---------- legal target dots (overlay, above pieces) ----------
  function showLegalTargets(fromSq){
    clearLegalTargets();
    var moves = game.moves({ square: fromSq, verbose: true }) || [];
    var cell = currentCell();
    for (var i = 0; i < moves.length; i++){
      var to = moves[i].to;
      var dot = document.createElement('div');
      dot.className = 'legal-dot';
      dot.dataset.square = to;
      placeDotAt(dot, to, cell);
      piecesLayer.appendChild(dot); // above pieces
    }
  }
  function clearLegalTargets(){
    var dots = $all('.legal-dot', piecesLayer);
    for (var i = 0; i < dots.length; i++) dots[i].remove();
  }
  function placeDotAt(node, square, cell){
    var xy = sqToXY(square);
    node.style.left   = ((xy[0] + 0.5) * cell) + 'px';
    node.style.top    = ((7 - xy[1] + 0.5) * cell) + 'px';
    var d = cell * 0.26;
    node.style.width  = d + 'px';
    node.style.height = d + 'px';
  }
  function positionAllDots(cell){
    var nodes = $all('.legal-dot', piecesLayer);
    for (var i = 0; i < nodes.length; i++){
      var sq = nodes[i].dataset.square;
      placeDotAt(nodes[i], sq, cell);
    }
  }

  // ---------- move animation & sync ----------
  function animateAndSync(move){
    lastMove = { from: move.from, to: move.to };
    var cell = currentCell();

    // remove captured node if present (so the mover can animate into the square)
    var capturedNode = piecesLayer.querySelector('.piece[data-square="' + move.to + '"]');
    if (capturedNode) capturedNode.remove();

    // handle castling rook animation (if available on this Chess build)
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

    // move the piece node from -> to (animates via CSS)
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

    // after short delay, hard-sync in case of promotions/en passant etc.
    setTimeout(function(){
      renderAllPieces();
      clearLastMoveHighlight();
      applyLastMoveHighlight();
      clearCheckMateRings();
      applyCheckMateRings();
      setStatusDefault();
    }, 120);
  }

  // ---------- layout utils ----------
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
    d.dataset.type = p.type;
    d.dataset.color = p.color;
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
    var yFromTop = Math.floor((e.clientY - r.top)  / cell);
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

  // ---------- highlights ----------
  function applyLastMoveHighlight(){
    if (!lastMove) return;
    var a = squareEl(lastMove.from); if (a) a.classList.add('last-from');
    var b = squareEl(lastMove.to);   if (b) b.classList.add('last-to');
  }
  function clearLastMoveHighlight(){
    var a = $all('.square.last-from'); for (var i=0;i<a.length;i++) a[i].classList.remove('last-from');
    var b = $all('.square.last-to');   for (var j=0;j<b.length;j++) b[j].classList.remove('last-to');
  }

  function applyCheckMateRings(){
    clearCheckMateRings();
    if (game.isCheckmate && game.isCheckmate()){
      var k1 = findKingSquare(game.turn());
      if (k1) { var n1 = squareEl(k1); if (n1) n1.classList.add('mate'); }
      setStatus('Checkmate.');
      return;
    }
    if (game.isCheck && game.isCheck()){
      var k2 = findKingSquare(game.turn());
      if (k2) { var n2 = squareEl(k2); if (n2) n2.classList.add('check'); }
      setStatus('Check.');
    }
  }
  function clearCheckMateRings(){
    var a = $all('.square.check'); for (var i=0;i<a.length;i++) a[i].classList.remove('check');
    var b = $all('.square.mate');  for (var j=0;j<b.length;j++) b[j].classList.remove('mate');
  }

  // ---------- status ----------
  function setStatus(text){ if (statusEl) statusEl.textContent = text || ''; }
  function turnText(){ return game.turn() === 'w' ? 'White' : 'Black'; }
  function setStatusDefault(){
    if (game.isCheckmate && game.isCheckmate()) return; // already set
    if (game.isDraw && game.isDraw()) { setStatus('Draw.'); return; }
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
