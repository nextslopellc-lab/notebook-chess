// log.js
(function(){
  const STORE='nb.log.v1';
  const MAX_SESS=50;
  const ALL_SQS = (()=> {
    const f='abcdefgh', r='12345678', a=[];
    for (let i=0;i<8;i++) for (let j=0;j<8;j++) a.push(f[i]+r[j]); return a;
  })();

  function now(){ return new Date().toISOString(); }
  function load(){ try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return[]} }
  function save(s){ localStorage.setItem(STORE, JSON.stringify(s)); }

  let sessions = load();
  let current = null;

  function startSession(kind='free-play'){
    endSession();
    current = { id: Date.now().toString(36), kind, started: now(), events: [] };
    sessions.push(current);
    if (sessions.length>MAX_SESS) sessions = sessions.slice(-MAX_SESS);
    save(sessions);
  }
  function endSession(){ if (!current) return; current.ended=now(); save(sessions); current=null; }
  function pushEvent(ev){ if (!current) startSession('free-play'); current.events.push(ev); save(sessions); }

  function countMob(game, pieceType){
    // Mobility for side-to-move piece type (simple & fast)
    const ms = game.moves({ verbose:true });
    return ms.filter(m=>m.piece===pieceType).length;
  }

  function features(game){
    // Center control (d4,e4,d5,e5)
    const centers=['d4','e4','d5','e5'];
    const control={w:0,b:0};
    for (const c of centers){
      if (game.attackers(c,'w')?.length) control.w++;
      if (game.attackers(c,'b')?.length) control.b++;
    }

    // Mobility: legal moves for side to move
    const mobility = game.moves().length;

    // Loose & Hanging pieces (both sides)
    const loose={w:0,b:0}, hanging={w:0,b:0};
    for (const sq of ALL_SQS){
      const p = game.get(sq);
      if (!p) continue;
      const opp = p.color==='w' ? 'b' : 'w';
      const attOpp = game.attackers(sq, opp).length;
      const defOwn = game.attackers(sq, p.color).length;
      if (attOpp>0 && defOwn===0) loose[p.color]++;
      if (attOpp>defOwn)         hanging[p.color]++;
    }

    // Position type v1: open / closed / semi-open (simple heuristic)
    const filesOpen = (()=>{ // number of fully-open files
      let open=0;
      for (const f of 'abcdefgh'){
        let pawns=0;
        for (const r of '12345678'){ const pc=game.get(f+r); if (pc?.type==='p') pawns++; }
        if (pawns===0) open++;
      }
      return open;
    })();
    const bishopMob = countMob(game,'b');
    const knightMob = countMob(game,'n');
    let positionType='semi-open';
    if (filesOpen>=2 && bishopMob>=knightMob+2) positionType='open';
    if (filesOpen===0 && knightMob>=bishopMob+2) positionType='closed';

    return { control, mobility, loose, hanging, positionType };
  }

  window.NBLog = {
    startSession, endSession,
    onMove(game, move){
      const f = features(game);
      pushEvent({ type:'move', at: now(), san: move.san, from: move.from, to: move.to, turnAfter: game.turn(), f });
    },
    onUndo(game, undone){
      pushEvent({ type:'undo', at: now(), san: undone?.san });
    },
    getSessions(){ return load(); }
  };

  // start one free-play session immediately
  startSession('free-play');
})();
