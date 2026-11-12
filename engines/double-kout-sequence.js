(function(root){
  const teamOf = player => player % 2 === 0 ? 'A' : 'B';
  function scoreSequence(trickWinners){
    if(!Array.isArray(trickWinners)||trickWinners.length!==13||trickWinners.some(p=>![0,1,2,3].includes(p))) throw new Error('برای محاسبه توالی باید برنده هر ۱۳ دست مشخص باشد');
    const scores={A:0,B:0},groups=[];
    let groupStart=0, searchFrom=3;
    while(groupStart<13){
      let closeAt=-1;
      for(let i=searchFrom;i<13;i++){
        if(trickWinners[i]===trickWinners[i-1]){closeAt=i;break;}
      }
      if(closeAt>=0){
        const winner=trickWinners[closeAt],team=teamOf(winner),count=closeAt-groupStart+1;
        scores[team]+=count;
        groups.push({from:groupStart+1,to:closeAt+1,count,winner,team,reason:'sequence'});
        groupStart=closeAt+1;
        searchFrom=groupStart+1;
      }else{
        const winner=trickWinners[12],team=teamOf(winner),count=13-groupStart;
        scores[team]+=count;
        groups.push({from:groupStart+1,to:13,count,winner,team,reason:'last-trick'});
        groupStart=13;
      }
    }
    return {scores,groups,total:scores.A+scores.B};
  }
  function evaluateChallenge(trickWinners,challengerTeam='A'){
    if(!['A','B'].includes(challengerTeam)) throw new Error('تیم اعلام‌کننده چالش نامعتبر است');
    const opponent=challengerTeam==='A'?'B':'A';
    if(!Array.isArray(trickWinners)||trickWinners.some(p=>![0,1,2,3].includes(p))) throw new Error('تاریخچه برنده دست‌ها نامعتبر است');
    for(let i=3;i<trickWinners.length;i++){
      if(teamOf(trickWinners[i])===opponent&&trickWinners[i]===trickWinners[i-1]){
        return {status:'failed-opponent-sequence',endedAtTrick:i+1,challengerTeam,opponentTeam:opponent};
      }
    }
    if(trickWinners.length<13) return {status:'pending',challengerTeam,opponentTeam:opponent};
    return teamOf(trickWinners[12])===challengerTeam
      ? {status:'success',endedAtTrick:13,challengerTeam,opponentTeam:opponent}
      : {status:'failed-last-trick',endedAtTrick:13,challengerTeam,opponentTeam:opponent};
  }
  const api={teamOf,scoreSequence,evaluateChallenge};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.DoubleKoutSequence=api;
})(typeof window!=='undefined'?window:globalThis);
