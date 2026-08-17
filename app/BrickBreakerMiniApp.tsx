/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAccount, useConnect, useDisconnect, useSendTransaction } from "wagmi";
import { parseEther } from "viem";

const GAME_FEE_RECIPIENT = "0xBe96fB12585Bd1cd2822Ae451A69eA5E8970806F";
const GAME_FEE_AMOUNT = parseEther("0.00001");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(
  supabaseUrl.startsWith("http") ? supabaseUrl : "https://dummy.supabase.co",
  supabaseAnonKey || "dummy-key"
);

const W = 390, H = 430, PW = 80, PH = 14, BR = 8;
const COLORS = ["#ff2d78", "#ff6000", "#ffcc00", "#44cc00", "#00c0d8", "#8040ff"];
const POWERUPS = {
  WIDE: ["↔", "EXPAND", "#00d4ff"], FIRE: ["🔥", "FIRE", "#ff9200"],
  LIFE: ["♥", "EXTRA LIFE", "#ff3070"], FREEZE: ["❄", "SLOW BALL", "#60c8ff"],
  MULTIBALL: ["✦", "MULTIBALL", "#b060ff"], BOMB: ["💣", "BOMB", "#ff4f78"],
  SHIELD: ["🛡", "SHIELD", "#50e0c0"], PRECISION: ["🎯", "PRECISION", "#ffd24a"],
} as const;
type PU = keyof typeof POWERUPS;
type BrickType = "normal" | "armored" | "explosive" | "multiplier" | "mystery";
type Brick = { x:number;y:number;width:number;height:number;status:number;hits:number;maxHits:number;type:BrickType;pu:PU|null;row:number };
type Ball = { x:number;y:number;vx:number;vy:number;active:boolean };
type Drop = { x:number;y:number;type:PU };
type Particle = { x:number;y:number;vx:number;vy:number;life:number;decay:number;size:number;color:string };

export default function BrickBreakerMiniApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  const canvasRef = useRef<HTMLCanvasElement>(null), bgRef = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>([]), bricks = useRef<Brick[]>([]), drops = useRef<Drop[]>([]), particles = useRef<Particle[]>([]);
  const paddleX = useRef((W-PW)/2), paddleW = useRef(PW), comboRef = useRef(0), scoreRef = useRef(0), levelRef = useRef(1), livesRef = useRef(4);
  const stateRef = useRef("menu"), mutedRef = useRef(false), fireRef = useRef(false), freezeRef = useRef(false), shieldRef = useRef(false), precisionRef = useRef(false);

  const [score,setScore]=useState(0),[level,setLevel]=useState(1),[lives,setLives]=useState(4),[gameState,setGameState]=useState("menu");
  const [muted,setMuted]=useState(false),[mode,setMode]=useState<"tournament"|"practice">("tournament"),[paying,setPaying]=useState(false),[paymentError,setPaymentError]=useState("");
  const [combo,setCombo]=useState(0),[showCombo,setShowCombo]=useState(false),[nearMiss,setNearMiss]=useState(false),[active,setActive]=useState<PU|null>(null);
  const [counts,setCounts]=useState<Record<PU,number>>({WIDE:0,FIRE:0,LIFE:0,FREEZE:0,MULTIBALL:0,BOMB:0,SHIELD:0,PRECISION:0});
  const [playerLv,setPlayerLv]=useState(1),[xp,setXp]=useState(0),[xpGain,setXpGain]=useState(0),[best,setBest]=useState(0),[newHigh,setNewHigh]=useState(false);
  const [rows,setRows]=useState<any[]>([]),[lbLoading,setLbLoading]=useState(false),[shareOpen,setShareOpen]=useState(false),[prev,setPrev]=useState("menu");

  const sync = () => { scoreRef.current=score; levelRef.current=level; livesRef.current=lives; stateRef.current=gameState; mutedRef.current=muted; };
  useEffect(sync,[score,level,lives,gameState,muted]);
  useEffect(()=>{ const need=playerLv*100; if(xp>=need){setPlayerLv(v=>v+1);setXp(v=>v-need);} },[xp,playerLv]);

  const audio = useCallback((kind:string)=>{
    if(mutedRef.current)return; try{const A=window.AudioContext||(window as any).webkitAudioContext;if(!A)return;const c=new A(),o=c.createOscillator(),g=c.createGain();const cfg:any={hit:[210,.06,.06],brick:[430,.1,.08],lose:[90,.2,.3],power:[620,.12,.16],level:[780,.16,.35],combo:[560,.12,.12]};const [f,v,d]=cfg[kind]||cfg.hit;o.frequency.value=f;o.type=kind==="brick"?"square":"sine";g.gain.value=v;g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+d);}catch{}
  },[]);
  const addParticles=useCallback((x:number,y:number,w:number,h:number,color:string,n=10)=>{for(let i=0;i<n;i++)particles.current.push({x:x+(Math.random()-.5)*w,y:y+(Math.random()-.5)*h,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5-1,life:1,decay:.045+Math.random()*.05,size:2+Math.random()*4,color});},[]);
  const multiplier=(c:number)=>c>=10?3:c>=7?2.5:c>=5?2:c>=3?1.5:1;
  const scoreAdd=useCallback((base:number)=>{const pts=Math.round(base*multiplier(comboRef.current));setScore(v=>v+pts);setXp(v=>v+Math.max(1,Math.round(pts/4)));if(comboRef.current>=3){setShowCombo(true);setTimeout(()=>setShowCombo(false),700);}return pts;},[]);

  const makeBricks=useCallback((lv:number)=>{
    const rowsN=Math.min(10,5+Math.floor((lv-1)/3)),cols=7,pad=5,left=7,top=14,bw=(W-left*2-pad*(cols-1))/cols,bh=18;const arr:Brick[]=[];
    for(let r=0;r<rowsN;r++)for(let c=0;c<cols;c++){const q=Math.random();let type:BrickType="normal",maxHits=1;if(lv>=2&&q<.1){type="armored";maxHits=lv>=6?3:2;}else if(lv>=3&&q<.17)type="explosive";else if(lv>=2&&q<.23)type="multiplier";else if(lv>=4&&q<.28)type="mystery";arr.push({x:c*(bw+pad)+left,y:r*(bh+pad)+top,width:bw,height:bh,status:1,hits:0,maxHits,type,pu:null,row:r});}
    const ids=arr.map((_,i)=>i).sort(()=>Math.random()-.5);const pus:PU[]=["WIDE","FIRE","FREEZE","MULTIBALL","BOMB","SHIELD","PRECISION"];let n=0;for(const i of ids){if(n>=Math.min(7,2+Math.floor(lv/2)))break;if(Math.random()<.32){arr[i].pu=pus[Math.floor(Math.random()*pus.length)];n++;}}if(lv%3===0){const i=ids.find(v=>!arr[v].pu);if(i!==undefined)arr[i].pu="LIFE";}bricks.current=arr;
  },[]);
  const resetBalls=useCallback((lv:number)=>{const s=1.9+(lv-1)*.11;balls.current=[{x:W/2,y:H-52,vx:Math.random()>.5?s:-s,vy:-s,active:true}];},[]);

  const clearPower=useCallback((type:PU)=>{
    if(type==="WIDE"){paddleW.current=PW;setActive(null);}if(type==="FIRE"){fireRef.current=false;setActive(null);}if(type==="FREEZE"){freezeRef.current=false;balls.current.forEach(b=>{b.vx*=1.92;b.vy*=1.92});setActive(null);}if(type==="SHIELD"){shieldRef.current=false;setActive(null);}if(type==="PRECISION"){precisionRef.current=false;setActive(null);}
  },[]);
  const activate=useCallback((type:PU)=>{
    audio("power");setCounts(v=>({...v,[type]:v[type]+1}));setActive(type);const timer=setTimeout(()=>clearPower(type),type==="SHIELD"?30000:7000);
    if(type==="WIDE"){paddleW.current=PW*1.5;}else if(type==="FIRE"){fireRef.current=true;}else if(type==="LIFE"){setLives(v=>Math.min(6,v+1));setActive(null);}else if(type==="FREEZE"){freezeRef.current=true;balls.current.forEach(b=>{b.vx*=.52;b.vy*=.52});}else if(type==="MULTIBALL"){const b=balls.current.find(v=>v.active);if(b){const s=Math.hypot(b.vx,b.vy);balls.current.push({x:b.x,y:b.y,vx:s*.72,vy:-Math.abs(s*.72),active:true},{x:b.x,y:b.y,vx:-s*.72,vy:-Math.abs(s*.72),active:true});}setActive(null);}else if(type==="BOMB"){const target=bricks.current.find(b=>b.status);if(target){const cx=target.x+target.width/2,cy=target.y+target.height/2;bricks.current.forEach(b=>{if(b.status&&Math.hypot(b.x+b.width/2-cx,b.y+b.height/2-cy)<target.width*1.8){b.status=0;scoreAdd(25);addParticles(b.x,b.y,b.width,b.height,"#ff4f78",14);}})}setActive(null);}else if(type==="SHIELD"){shieldRef.current=true;}else if(type==="PRECISION"){precisionRef.current=true;}
    return ()=>clearTimeout(timer);
  },[addParticles,audio,clearPower,scoreAdd]);

  const submit=useCallback(async(s:number,l:number)=>{if(!address||s<=0)return;if(s>best){setBest(s);setNewHigh(true);}try{await supabase.rpc("upsert_best_score",{p_wallet:address,p_score:s,p_level:l});}catch(e){console.error("SCORE SUBMIT ERROR",e);}},[address,best]);
  const fetchLB=useCallback(async()=>{setLbLoading(true);try{const {data,error}=await supabase.from("leaderboard").select("wallet_address,best_score,best_level").order("best_score",{ascending:false}).limit(10);if(error){console.error("LEADERBOARD ERROR",error);setRows([]);}else setRows(data||[]);}catch(e){console.error(e);setRows([]);}finally{setLbLoading(false);}},[]);
  const openLB=()=>{setPrev(gameState);setGameState("leaderboard");fetchLB();};

  const start=useCallback(async()=>{if(!isConnected){alert("Please connect your wallet first.");return;}setPaymentError("");if(mode==="tournament"){setPaying(true);try{await sendTransactionAsync({to:GAME_FEE_RECIPIENT,value:GAME_FEE_AMOUNT});}catch{setPaymentError("Payment rejected.");setPaying(false);return;}setPaying(false);}setScore(0);setLevel(1);setLives(4);setCombo(0);setXpGain(0);setNewHigh(false);setActive(null);setCounts({WIDE:0,FIRE:0,LIFE:0,FREEZE:0,MULTIBALL:0,BOMB:0,SHIELD:0,PRECISION:0});comboRef.current=0;paddleW.current=PW;fireRef.current=false;freezeRef.current=false;shieldRef.current=false;precisionRef.current=false;particles.current=[];drops.current=[];paddleX.current=(W-PW)/2;makeBricks(1);resetBalls(1);setGameState("playing");},[isConnected,mode,sendTransactionAsync,makeBricks,resetBalls]);
  const nextLevel=()=>{const l=levelRef.current;makeBricks(l);resetBalls(l);paddleW.current=PW;fireRef.current=false;freezeRef.current=false;precisionRef.current=false;shieldRef.current=false;comboRef.current=0;setCombo(0);setActive(null);drops.current=[];particles.current=[];setGameState("playing");};

  useEffect(()=>{
    let raf=0;
    const drawBrick=(ctx:CanvasRenderingContext2D,b:Brick)=>{if(!b.status)return;let c=COLORS[b.row%COLORS.length];if(b.type==="armored")c="#60708a";if(b.type==="explosive")c="#ff4055";if(b.type==="multiplier")c="#ffc400";if(b.type==="mystery")c="#a040ff";const g=ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.height);g.addColorStop(0,"#fff");g.addColorStop(.15,c);g.addColorStop(1,"#22003d");ctx.save();ctx.fillStyle=g;ctx.shadowColor=c;ctx.shadowBlur=b.type==="normal"?7:13;ctx.beginPath();ctx.roundRect(b.x,b.y,b.width,b.height,6);ctx.fill();ctx.shadowBlur=0;if(b.type!=="normal"){ctx.fillStyle="#fff";ctx.font="bold 10px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(b.type==="armored"?"◆":b.type==="explosive"?"✹":b.type==="multiplier"?"×":"?",b.x+b.width/2,b.y+b.height/2);}if(b.pu){const p=POWERUPS[b.pu];ctx.strokeStyle=p[2];ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(b.x+b.width/2,b.y+b.height/2,6,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#fff";ctx.font="bold 8px sans-serif";ctx.fillText(p[0],b.x+b.width/2,b.y+b.height/2+.5);}ctx.restore();};
    const update=()=>{if(stateRef.current!=="playing")return;const slow=freezeRef.current?.52:1;
      for(const ball of balls.current){if(!ball.active)continue;ball.x+=ball.vx*slow;ball.y+=ball.vy*slow;if(ball.x+BR>W){ball.x=W-BR;ball.vx=-Math.abs(ball.vx);audio("hit");}if(ball.x-BR<0){ball.x=BR;ball.vx=Math.abs(ball.vx);audio("hit");}if(ball.y-BR<0){ball.y=BR;ball.vy=Math.abs(ball.vy);audio("hit");}
        const py=H-PH-5;if(ball.vy>0&&ball.y+BR>=py&&ball.y-BR<=py+PH&&ball.x>=paddleX.current&&ball.x<=paddleX.current+paddleW.current){const f=((ball.x-paddleX.current)/paddleW.current-.5)*2,s=Math.max(1.85,Math.hypot(ball.vx,ball.vy)),a=f*65*Math.PI/180;ball.vx=s*Math.sin(a);ball.vy=-Math.abs(s*Math.cos(a));audio("hit");if(Math.abs(f)>.88){setNearMiss(true);scoreAdd(25);setTimeout(()=>setNearMiss(false),500);}comboRef.current=0;setCombo(0);}
        for(const b of bricks.current){if(!b.status)continue;if(ball.x+BR>=b.x&&ball.x-BR<=b.x+b.width&&ball.y+BR>=b.y&&ball.y-BR<=b.y+b.height){b.hits++;if(b.hits>=b.maxHits){b.status=0;comboRef.current++;setCombo(comboRef.current);if(comboRef.current>=3)audio("combo");else audio("brick");scoreAdd(b.type==="armored"?25:b.type==="multiplier"?35:10);if(b.type==="multiplier")scoreAdd(30);if(b.type==="explosive"){const cx=b.x+b.width/2,cy=b.y+b.height/2;bricks.current.forEach(o=>{if(o!==b&&o.status&&Math.hypot(o.x+o.width/2-cx,o.y+o.height/2-cy)<b.width*1.65){o.status=0;scoreAdd(20);addParticles(o.x,o.y,o.width,o.height,"#ff4055",10);}});}if(b.type==="mystery"){const list=(Object.keys(POWERUPS) as PU[]).filter(x=>x!=="LIFE");drops.current.push({x:b.x+b.width/2,y:b.y+b.height,type:list[Math.floor(Math.random()*list.length)]});}if(b.pu)drops.current.push({x:b.x+b.width/2,y:b.y+b.height,type:b.pu});addParticles(b.x,b.y,b.width,b.height, b.type==="explosive"?"#ff4055":cForBrick(b),b.type==="explosive"?22:12);}else addParticles(b.x,b.y,b.width,b.height,"#b0bdd0",6);if(!fireRef.current)ball.vy=-ball.vy;break;}}
        if(ball.y>H+20)ball.active=false;
      }
      if(!balls.current.some(b=>b.active)){if(shieldRef.current){shieldRef.current=false;setActive(null);resetBalls(levelRef.current);}else{const nl=livesRef.current-1;setLives(nl);comboRef.current=0;setCombo(0);if(nl<=0){setGameState("gameover");submit(scoreRef.current,levelRef.current);}else resetBalls(levelRef.current);}}else balls.current=balls.current.filter(b=>b.active);
      for(let i=drops.current.length-1;i>=0;i--){const d=drops.current[i];d.y+=1.6;if(d.y>=H-PH-12&&d.x>=paddleX.current&&d.x<=paddleX.current+paddleW.current){activate(d.type);drops.current.splice(i,1);}else if(d.y>H+20)drops.current.splice(i,1);}
      particles.current=particles.current.filter(p=>p.life>0);particles.current.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.2;p.life-=p.decay;});if(!bricks.current.some(b=>b.status)){const gain=75+levelRef.current*20+comboRef.current*8;setXpGain(gain);setXp(v=>v+gain);setLevel(v=>v+1);audio("level");setGameState("levelup");}
    };
    const cForBrick=(b:Brick)=>b.type==="mystery"?"#a040ff":b.type==="multiplier"?"#ffd000":COLORS[b.row%COLORS.length];
    const render=()=>{const cv=canvasRef.current;if(!cv)return;const ctx=cv.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,W,H);ctx.fillStyle="#07051d";ctx.fillRect(0,0,W,H);for(let i=0;i<45;i++){ctx.fillStyle=`rgba(255,255,255,${.04+(i%5)*.025})`;ctx.beginPath();ctx.arc((i*97+30)%W,(i*71+15)%H,i%5===0?1.3:.7,0,Math.PI*2);ctx.fill();}bricks.current.forEach(b=>drawBrick(ctx,b));particles.current.forEach(p=>{ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);ctx.restore();});drops.current.forEach(d=>{const p=POWERUPS[d.type];ctx.save();ctx.strokeStyle=p[2];ctx.shadowColor=p[2];ctx.shadowBlur=15;ctx.beginPath();ctx.arc(d.x,d.y,12,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle="#fff";ctx.font="bold 9px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(p[0],d.x,d.y);ctx.restore();});if(precisionRef.current&&balls.current[0]){const b=balls.current[0];ctx.save();ctx.setLineDash([5,5]);ctx.strokeStyle="rgba(255,210,74,.55)";ctx.beginPath();ctx.moveTo(b.x,b.y);let x=b.x,y=b.y,vx=b.vx,vy=b.vy;for(let i=0;i<80;i++){x+=vx;y+=vy;if(x<0||x>W){vx=-vx;x=Math.max(0,Math.min(W,x));}if(y<0){vy=-vy;y=0;}if(y>H-PH-10)break;}ctx.lineTo(x,y);ctx.stroke();ctx.restore();}const py=H-PH-5;ctx.save();ctx.fillStyle=shieldRef.current?"#50e0c0":"#5060ff";ctx.shadowColor=shieldRef.current?"#50e0c0":"#6060ff";ctx.shadowBlur=30;ctx.beginPath();ctx.roundRect(paddleX.current,py,paddleW.current,PH,7);ctx.fill();ctx.restore();balls.current.forEach(b=>{if(!b.active)return;const color=fireRef.current?"#ff9000":freezeRef.current?"#70d0ff":balls.current.length>1?"#b060ff":"#ff3070";ctx.save();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=28;ctx.beginPath();ctx.arc(b.x,b.y,BR,0,Math.PI*2);ctx.fill();ctx.restore();});if(stateRef.current==="paused"){ctx.fillStyle="rgba(0,0,0,.65)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.font="bold 30px Arial";ctx.textAlign="center";ctx.fillText("⏸ PAUSED",W/2,H/2);}};
    const loop=()=>{update();render();raf=requestAnimationFrame(loop)};if(gameState==="playing"||gameState==="paused"||gameState==="gameover")raf=requestAnimationFrame(loop);return()=>cancelAnimationFrame(raf);
  },[activate,audio,gameState,resetBalls,scoreAdd,submit,addParticles]);

  const move=(e:any)=>{if(stateRef.current!=="playing")return;const cv=canvasRef.current;if(!cv)return;const r=cv.getBoundingClientRect();const x=(e.clientX-r.left)*(W/r.width);paddleX.current=Math.max(0,Math.min(W-paddleW.current,x-paddleW.current/2));};
  const touch=(e:any)=>{if(stateRef.current!=="playing"||!e.touches.length)return;if(e.cancelable)e.preventDefault();const cv=canvasRef.current;if(!cv)return;const r=cv.getBoundingClientRect();const x=(e.touches[0].clientX-r.left)*(W/r.width);paddleX.current=Math.max(0,Math.min(W-paddleW.current,x-paddleW.current/2));};
  const shareText=`Base Brick Breaker'da ${level}. seviyeye ulaşıp ${score.toLocaleString()} puan yaptım. ${combo>=5?`x${combo} COMBO! `:""}Beni geçebilir misin? 🔥`;
  const share=async(type:string)=>{setShareOpen(false);try{const mod=await import("@farcaster/miniapp-sdk");const sdk=mod.sdk||mod.default;const url=window.location.href;if(type==="fc"&&sdk&&await sdk.isInMiniApp())await sdk.actions.composeCast({text:shareText,embeds:[url]});else if(navigator.share)await navigator.share({text:shareText,url});else await navigator.clipboard.writeText(`${shareText} ${url}`);}catch{try{await navigator.clipboard.writeText(`${shareText} ${window.location.href}`)}catch{}}};
  const xpNeed=playerLv*100;

  return <div style={{background:"linear-gradient(160deg,#060418,#0c0828,#060418)",borderRadius:20,overflow:"hidden",maxWidth:440,margin:"0 auto",fontFamily:"Arial,sans-serif",color:"#fff"}}>
    {gameState==="menu"&&<div style={{padding:"22px 20px 24px",minHeight:600}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><b style={{color:"#c0b0ff",letterSpacing:2}}>BASE BRICK</b><button onClick={()=>isConnected?disconnect():connect({connector:connectors[0]})} style={btn("rgba(0,220,200,.12)","#00dcc8")}>{isConnected?`${address?.slice(0,4)}...${address?.slice(-4)}`:"Connect Wallet"}</button></div>
      <div style={{textAlign:"center",margin:"26px 0 18px"}}><div style={{fontSize:22,fontWeight:900,letterSpacing:3}}>BASE BRICK</div><div style={{fontSize:48,fontWeight:900,letterSpacing:3,color:"#b060ff",textShadow:"0 0 25px #8040ff"}}>BREAKER</div><small style={{color:"#706090",letterSpacing:3}}>PHASE 1 ARCADE EVOLUTION</small></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}><Card title={`LEVEL ${playerLv}`} value={`${xp}/${xpNeed} XP`}/><Card title="BEST SCORE" value={best.toLocaleString()}/></div>
      <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:10}}>{(["tournament","practice"] as const).map(m=><button key={m} onClick={()=>setMode(m)} style={btn(mode===m?"rgba(120,70,255,.3)":"rgba(255,255,255,.05)",mode===m?"#c090ff":"#686080")}>{m==="tournament"?"🏆 Tournament":"🕹 Practice"}</button>)}</div>
      {mode==="tournament"&&<div style={{textAlign:"center",color:"#ff8848",fontSize:10,marginBottom:8}}>0.00001 ETH per tournament game on Base</div>}
      <button onClick={start} disabled={paying} style={{...bigBtn,opacity:paying?.65:1}}>{paying?"CONFIRMING...":"▶ PLAY NOW"}</button>{paymentError&&<div style={{color:"#ff5060",fontSize:11,textAlign:"center",margin:8}}>{paymentError}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}><button onClick={openLB} style={tile("#6090ff")}>🏆 LEADERBOARD</button><button onClick={()=>setMuted(v=>!v)} style={tile("#8090c0")}>{muted?"🔇 SOUND OFF":"🔊 SOUND ON"}</button></div>
      <div style={{textAlign:"center",marginTop:22,color:"#51406d",fontSize:9}}>COMBOS • SPECIAL BRICKS • MULTIBALL • BOMBS • SHIELDS</div>
    </div>}

    {(gameState==="playing"||gameState==="paused"||gameState==="gameover")&&<div>
      <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid #ffffff12"}}><b style={{color:"#b090ff"}}>BASE BRICK BREAKER</b><button onClick={()=>isConnected?disconnect():connect({connector:connectors[0]})} style={btn("rgba(0,220,200,.1)","#00dcc8")}>{isConnected?`${address?.slice(0,4)}...${address?.slice(-4)}`:"Connect"}</button></div>
      <div style={{display:"flex",justifyContent:"space-around",padding:8,background:"#0006"}}>{[["SCORE",score.toLocaleString(),"#00e5ff"],["COMBO",combo>1?`x${combo}`:"—",combo>=5?"#ffd000":"#a070ff"],["LIVES","❤️".repeat(Math.max(0,lives)),"#ff3070"],["LEVEL",level,"#b060ff"]].map((x:any)=><div key={x[0]} style={{textAlign:"center"}}><small style={{color:"#504060",fontSize:8}}>{x[0]}</small><div style={{color:x[2],fontWeight:900,fontSize:14}}>{x[1]}</div></div>)}</div>
      <div style={{position:"relative",margin:6,border:"2px solid #8040ff77",borderRadius:14,overflow:"hidden"}}><canvas ref={canvasRef} width={W} height={H} onPointerMove={move} onTouchMove={touch} onTouchStart={touch} style={{width:"100%",display:"block",touchAction:"none"}}/>{showCombo&&<div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",color:combo>=10?"#ff70ff":"#ffd000",fontWeight:900,fontSize:combo>=10?22:17,textShadow:"0 0 15px currentColor",pointerEvents:"none"}}>{combo>=10?"💥 BRICK STORM!":combo>=7?"🔥 ON FIRE!":`x${combo} COMBO!`}</div>}{nearMiss&&<div style={{position:"absolute",top:42,left:"50%",transform:"translateX(-50%)",color:"#5fe5ff",fontWeight:900,fontSize:12}}>CLOSE! +25</div>}{active&&<div style={{position:"absolute",top:8,left:8,padding:"4px 8px",borderRadius:8,background:"#ffffff18",color:POWERUPS[active][2],fontSize:9,fontWeight:900}}>{POWERUPS[active][0]} {POWERUPS[active][1]}</div>}<button onClick={()=>setGameState(gameState==="paused"?"playing":"paused")} style={circleBtn}>{gameState==="paused"?"▶":"⏸"}</button><button onClick={openLB} style={{...circleBtn,right:10,left:"auto",color:"#ffd000"}}>🏆</button>{gameState==="gameover"&&<div style={{position:"absolute",inset:0,background:"#040214f2",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}><div style={{fontSize:44,fontWeight:900,color:"#ff5070"}}>GAME OVER</div>{newHigh&&<b style={{color:"#ffd000"}}>🌟 NEW HIGH SCORE!</b>}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",width:"90%",background:"#ffffff0d",borderRadius:18,padding:15}}>{[["SCORE",score.toLocaleString()],["BEST",Math.max(score,best).toLocaleString()],["LEVEL",level]].map((x:any)=><div key={x[0]} style={{textAlign:"center"}}><small style={{color:"#604070"}}>{x[0]}</small><div style={{fontSize:23,fontWeight:900}}>{x[1]}</div></div>)}</div><div style={{display:"flex",gap:14}}><button onClick={()=>setGameState("menu")} style={circleAction}>🏠<small>HOME</small></button><button onClick={start} style={{...circleAction,width:90,height:90,background:"#9030ff"}}>↺<small>RETRY</small></button><div style={{position:"relative"}}><button onClick={()=>setShareOpen(v=>!v)} style={circleAction}>📤<small>SHARE</small></button>{shareOpen&&<div style={{position:"absolute",bottom:"110%",right:0,background:"#17123d",border:"1px solid #ffffff18",borderRadius:10,overflow:"hidden"}}><button onClick={()=>share("fc")} style={shareBtn}>🟣 Farcaster</button><button onClick={()=>share("x")} style={shareBtn}>✖ X</button></div>}</div></div></div>}</div>
      <div style={{padding:"10px 12px 12px",background:"#0c0822",borderTop:"2px solid #8040ff55"}}><div style={{color:"#665090",fontSize:9,fontWeight:800,letterSpacing:2,marginBottom:7}}>POWER-UPS</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>{(Object.keys(POWERUPS) as PU[]).map(p=><div key={p} style={{textAlign:"center",opacity:counts[p]||active===p?1:.35}}><div style={{height:44,borderRadius:10,border:`1px solid ${POWERUPS[p][2]}66`,background:`${POWERUPS[p][2]}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19}}>{POWERUPS[p][0]}</div><b style={{fontSize:11,color:POWERUPS[p][2]}}>{counts[p]}</b></div>)}</div></div>
    </div>}

    {gameState==="levelup"&&<div style={{minHeight:600,padding:40,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18,background:"linear-gradient(#080020,#18006a,#080020)"}}><div style={{fontSize:42,fontWeight:900,color:"#e060ff",textShadow:"0 0 35px #c040ff"}}>LEVEL UP!</div><div style={{fontSize:56,fontWeight:900,color:"#00d4ff"}}>LEVEL {level}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",width:"100%",gap:10}}><Card title="SCORE" value={score.toLocaleString()}/><Card title="XP GAINED" value={`+${xpGain}`}/></div><button onClick={nextLevel} style={bigBtn}>▶ NEXT LEVEL</button><button onClick={openLB} style={tile("#ffd000")}>🏆 LEADERBOARD</button></div>}

    {gameState==="leaderboard"&&<div style={{minHeight:600,paddingBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:14,borderBottom:"1px solid #ffffff12"}}><button onClick={()=>setGameState(prev||"menu")} style={backBtn}>←</button><b style={{fontSize:17}}>🏆 LEADERBOARD</b><span style={{fontSize:9,color:"#b060ff"}}>{address?`${address.slice(0,4)}...${address.slice(-4)}`:""}</span></div><div style={{padding:"12px 16px",textAlign:"center",color:"#fff",background:"#7040ff",margin:"10px 16px",borderRadius:9,fontSize:10,fontWeight:900}}>GLOBAL TOP 10</div><div style={{padding:"0 16px"}}>{lbLoading?<div style={{textAlign:"center",padding:35,color:"#8060c0"}}>Loading...</div>:rows.length===0?<div style={{textAlign:"center",padding:35,color:"#604070"}}>No scores yet. Be the first!</div>:rows.map((r,i)=><div key={r.wallet_address} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",marginBottom:7,borderRadius:13,background:i===0?"#ffd00012":r.wallet_address?.toLowerCase()===address?.toLowerCase()?"#8040ff20":"#ffffff08",border:"1px solid #ffffff0d"}}><div style={{display:"flex",alignItems:"center",gap:10}}><b style={{width:22,color:i<3?"#ffd000":"#806090",textAlign:"center"}}>{["🥇","🥈","🥉"][i]||i+1}</b><span style={{fontSize:12}}>{r.wallet_address.slice(0,6)}...{r.wallet_address.slice(-4)}</span></div><div style={{textAlign:"right"}}><b style={{color:i===0?"#ffd000":"#00d080"}}>{Number(r.best_score||0).toLocaleString()}</b><small style={{display:"block",color:"#503060",fontSize:8}}>LV {r.best_level}</small></div></div>)}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"10px 16px"}}><button onClick={start} style={bigBtn}>▶ PLAY AGAIN</button><button onClick={()=>setShareOpen(v=>!v)} style={tile("#a090ff")}>Share 📤</button></div></div>}
  </div>;
}

const btn=(bg:string,color:string)=>({padding:"7px 13px",borderRadius:20,border:"1px solid #ffffff18",background:bg,color,fontWeight:800,fontSize:10,cursor:"pointer"});
const tile=(color:string)=>({padding:14,borderRadius:14,border:`1px solid ${color}55`,background:`${color}12`,color,fontWeight:800,fontSize:11,cursor:"pointer"});
const bigBtn={width:"100%",padding:17,borderRadius:16,border:"none",background:"linear-gradient(135deg,#ff2060,#cc1890,#8020c0)",color:"#fff",fontWeight:900,fontSize:18,letterSpacing:1.5,cursor:"pointer",boxShadow:"0 0 30px #c0289655"};
const circleBtn:any={position:"absolute",bottom:10,left:10,width:44,height:44,borderRadius:"50%",border:"2px solid #a078ff99",background:"#5030aacc",color:"#fff",fontSize:17,cursor:"pointer"};
const circleAction:any={width:68,height:68,borderRadius:"50%",border:"1px solid #ffffff30",background:"#ffffff10",color:"#fff",fontWeight:800,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2};
const shareBtn:any={display:"block",width:130,padding:10,border:"none",background:"transparent",color:"#fff",textAlign:"left",cursor:"pointer",fontSize:11};
const backBtn:any={background:"none",border:"none",color:"#8060a0",fontSize:23,cursor:"pointer"};
function Card({title,value}:{title:string;value:string}){return <div style={{padding:12,borderRadius:14,background:"#ffffff08",border:"1px solid #ffffff12"}}><small style={{color:"#605080",fontSize:8,letterSpacing:1.2}}>{title}</small><div style={{fontSize:17,fontWeight:900,color:"#d0b0ff",marginTop:4}}>{value}</div></div>}
