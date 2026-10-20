(function(){
  'use strict';
  if(window.LegatPracticeMorph&&window.LegatPracticeMorph.version===3){window.LegatPracticeMorph.init();return;}
  const CONFIG={"version":3,"count":43008,"directions":[{"id":"bjj","label":"BJJ / Грэпплинг","triggerClass":"legat-trigger-bjj","assetFile":"legat-practice-bjj-v3.js","index":1},{"id":"combat","label":"Combat Jiu-Jitsu","triggerClass":"legat-trigger-combat","assetFile":"legat-practice-combat-v3.js","index":2},{"id":"hand","label":"Рукопашный бой","triggerClass":"legat-trigger-hand","assetFile":"legat-practice-hand-v3.js","index":3},{"id":"kickboxing","label":"Кикбоксинг","triggerClass":"legat-trigger-kickboxing","assetFile":"legat-practice-kickboxing-v3.js","index":4},{"id":"fitness","label":"Fight Fitness","triggerClass":"legat-trigger-fitness","assetFile":"legat-practice-fitness-v3.js","index":5}]};
  const COUNT=CONFIG.count,engineScript=document.currentScript;
  const baseUrl=engineScript&&engineScript.src?new URL('.',engineScript.src).href:document.baseURI;
  const assets=new Map(),pending=new Map(),instances=new WeakMap();let serial=0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smoothstep=v=>v*v*(3-2*v);
  function hilbert(x,y){let d=0;for(let s=128;s;s>>=1){const rx=(x&s)?1:0,ry=(y&s)?1:0;d+=s*s*((3*rx)^ry);if(!ry){if(rx){x=255-x;y=255-y;}const t=x;x=y;y=t;}}return d;}
  function camera(angle,elapsed,pointer){return {yaw:angle+pointer.x*.16,pitch:.92+Math.sin(elapsed*.065)*.1+pointer.y*.12,roll:-.33+Math.sin(elapsed*.045)*.07};}
  function matrix(c){return [Math.cos(c.yaw),Math.sin(c.yaw),Math.cos(c.pitch),Math.sin(c.pitch),Math.cos(c.roll),Math.sin(c.roll)];}
  function project(x,y,z,m){const xx=x*m[0]-z*m[1];let zz=x*m[1]+z*m[0];const yy=y*m[2]-zz*m[3];zz=y*m[3]+zz*m[2];const s=184*5.5/(5.5-zz);return [300+(xx*m[4]-yy*m[5])*s,293+(xx*m[5]+yy*m[4])*s,zz];}
  function registerAsset(id,data){
    if(!CONFIG.directions.some(d=>d.id===id)||data.version!==3||data.id!==id||data.count!==COUNT||typeof data.packed!=='string')throw Error('Invalid LEGAT asset: '+id);
    const binary=atob(data.packed);if(binary.length!==COUNT*8)throw Error('Incomplete LEGAT asset: '+id);
    const positions=new Float32Array(COUNT*2),colours=new Float32Array(COUNT*4);
    for(let i=0;i<COUNT;i++){const k=i*8;positions[i*2]=(binary.charCodeAt(k)+binary.charCodeAt(k+1)*256)/10;positions[i*2+1]=(binary.charCodeAt(k+2)+binary.charCodeAt(k+3)*256)/10;for(let c=0;c<4;c++)colours[i*4+c]=binary.charCodeAt(k+4+c)/255;}
    const asset={positions,colours,pointSize:data.pointSize};assets.set(id,asset);
    const task=pending.get(id);if(task){clearTimeout(task.timer);pending.delete(id);task.resolve(asset);}
  }
  function loadAsset(id){
    if(assets.has(id))return Promise.resolve(assets.get(id));
    if(pending.has(id))return pending.get(id).promise;
    const item=CONFIG.directions.find(d=>d.id===id);if(!item)return Promise.reject(Error('Unknown LEGAT direction'));
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const script=document.createElement('script');script.src=new URL(item.assetFile,baseUrl).href;script.async=true;
    const task={promise,resolve,reject,script,timer:0};pending.set(id,task);
    function fail(){if(pending.get(id)!==task)return;clearTimeout(task.timer);pending.delete(id);script.remove();reject(Error('LEGAT asset unavailable: '+id));}
    script.onerror=fail;script.onload=()=>{if(!assets.has(id))fail();};task.timer=setTimeout(fail,20000);document.head.appendChild(script);return promise;
  }
  function createWebGL(canvas,ring,gold){
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,depth:false,preserveDrawingBuffer:true});if(!gl)return null;
    const vertex=`
      attribute vec3 aRing; attribute float aGold;
      attribute vec2 aFrom,aTo,aSmooth; attribute vec4 aFromShade,aToShade;
      uniform vec3 uAngles; uniform float uProgress,uSmooth,uRing,uSize,uDensity;
      varying vec4 vColour;
      void main(){
        float cy=cos(uAngles.x),sy=sin(uAngles.x),cp=cos(uAngles.y),sp=sin(uAngles.y),cr=cos(uAngles.z),sr=sin(uAngles.z);
        float x=aRing.x*cy-aRing.z*sy,z=aRing.x*sy+aRing.z*cy,y=aRing.y*cp-z*sp;
        z=aRing.y*sp+z*cp;
        vec2 pos=vec2(300.,293.)+vec2(x*cr-y*sr,x*sr+y*cr)*(184.*5.5/(5.5-z));
        vec3 colour=mix(vec3(209.,210.,202.)/255.,vec3(152.,136.,106.)/255.,aGold);
        float near=clamp((z+1.35)/2.7,0.,1.),alpha=(.17+near*.57)*uDensity;
        if(uRing<.5){
          float resolve=mix(uProgress,smoothstep(.45,1.,uProgress),uSmooth);
          pos=mix(aFrom,mix(aSmooth,aTo,resolve),uProgress);
          vec4 shade=mix(aFromShade,aToShade,resolve);colour=shade.rgb;alpha=shade.a;
        }
        gl_Position=vec4(pos.x/300.-1.,1.-pos.y/300.,0.,1.);
        gl_PointSize=max(1.,uSize);alpha*=min(1.,uSize*uSize);
        vColour=vec4(colour*alpha,alpha);
      }`;
    const fragment='precision mediump float;varying vec4 vColour;void main(){gl_FragColor=vColour;}';
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    const program=gl.createProgram(),vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffers=[];
    function attribute(name,size,data){const buffer=gl.createBuffer();buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);return buffer;}
    attribute('aRing',3,ring);attribute('aGold',1,gold);
    const fp=attribute('aFrom',2,new Float32Array(COUNT*2)),tp=attribute('aTo',2,new Float32Array(COUNT*2)),sp=attribute('aSmooth',2,new Float32Array(COUNT*2));
    const fc=attribute('aFromShade',4,new Float32Array(COUNT*4)),tc=attribute('aToShade',4,new Float32Array(COUNT*4));
    const u={};['Angles','Progress','Smooth','Ring','Size','Density'].forEach(name=>{u[name]=gl.getUniformLocation(program,'u'+name);});
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
    function send(buffer,data){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}
    return {type:'webgl',upload:t=>{send(fp,t.from.positions);send(tp,t.to.positions);send(sp,t.smoothPositions);send(fc,t.from.colours);send(tc,t.to.colours);},
      draw:(c,idle,p,size,cohesion)=>{gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform3f(u.Angles,c.yaw,c.pitch,c.roll);gl.uniform1f(u.Progress,p);gl.uniform1f(u.Smooth,cohesion?1:0);gl.uniform1f(u.Ring,idle?1:0);gl.uniform1f(u.Size,size*canvas.width/600);gl.uniform1f(u.Density,Math.min(1,6500/COUNT));gl.drawArrays(gl.POINTS,0,COUNT);},
      dispose:()=>{buffers.forEach(b=>gl.deleteBuffer(b));gl.deleteShader(vs);gl.deleteShader(fs);gl.deleteProgram(program);}};
  }
  function createCanvas(canvas,ring,gold){
    const ctx=canvas.getContext('2d');let pose=null;
    return {type:'canvas',upload:t=>{pose=t;},dispose:()=>{},draw:(c,idle,p,size,cohesion)=>{
      const scale=canvas.width/600,m=matrix(c),density=Math.min(1,6500/COUNT),resolve=cohesion?smoothstep(clamp((p-.45)/.55,0,1)):p;
      ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,600,600);
      for(let i=0;i<COUNT;i++){
        let x,y,r,g,b,a;
        if(idle){const pos=project(ring[i*3],ring[i*3+1],ring[i*3+2],m);x=pos[0];y=pos[1];r=gold[i]?152:209;g=gold[i]?136:210;b=gold[i]?106:202;a=(.17+clamp((pos[2]+1.35)/2.7,0,1)*.57)*density;}
        else {const k=i*2,q=i*4,tx=pose.smoothPositions[k]+(pose.to.positions[k]-pose.smoothPositions[k])*resolve,ty=pose.smoothPositions[k+1]+(pose.to.positions[k+1]-pose.smoothPositions[k+1])*resolve;
          x=pose.from.positions[k]+(tx-pose.from.positions[k])*p;y=pose.from.positions[k+1]+(ty-pose.from.positions[k+1])*p;
          r=255*(pose.from.colours[q]+(pose.to.colours[q]-pose.from.colours[q])*resolve);g=255*(pose.from.colours[q+1]+(pose.to.colours[q+1]-pose.from.colours[q+1])*resolve);b=255*(pose.from.colours[q+2]+(pose.to.colours[q+2]-pose.from.colours[q+2])*resolve);a=pose.from.colours[q+3]+(pose.to.colours[q+3]-pose.from.colours[q+3])*resolve;
        }
        ctx.fillStyle='rgba('+Math.round(r)+','+Math.round(g)+','+Math.round(b)+','+a.toFixed(3)+')';ctx.fillRect(x-size/2,y-size/2,size,size);
      }
    }};
  }
  function initialize(){document.querySelectorAll('.legat-practice-morph').forEach(root=>{
    if(instances.has(root))return;
    let canvas=root.querySelector('canvas');const pause=root.querySelector('.legat-practice-pause'),reset=root.querySelector('.legat-practice-reset'),status=root.querySelector('.legat-practice-status');
    if(!canvas||!pause||!reset||!status)return;
    const region=root.closest('[data-legat-practice-region]')||root.closest('.t396')||root;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'),abort=new AbortController(),options={signal:abort.signal};
    const ring=new Float32Array(COUNT*3),gold=new Float32Array(COUNT),aim={x:0,y:0},pointer={x:0,y:0};
    for(let group=0;group<6;group++){
      const start=COUNT*group/6,end=COUNT*(group+1)/6,phase=Math.floor(group/2)*Math.PI*2/3;
      for(let i=start;i<end;i++){const t=(i-start)/(end-start)*Math.PI*2,q=t+phase,r=.79+.49*Math.cos(q),side=group%2?.015:-.015;
        ring[i*3]=(r+Math.cos(q)*side)*Math.cos(t);ring[i*3+1]=(r+Math.cos(q)*side)*Math.sin(t);ring[i*3+2]=Math.sin(q)*(.49+side);gold[i]=group===4?1:0;}
    }
    let renderer=null;
    if(root.dataset.renderer!=='canvas')try{renderer=createWebGL(canvas,ring,gold);}catch(error){const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;}
    if(!renderer)renderer=createCanvas(canvas,ring,gold);
    root.dataset.renderer=renderer.type;root.dataset.count=String(COUNT);root.dataset.ready='1';
    let requested=null,visualId=null,settled=null,transition=null,lastUpload=null,progress=0,angle=.67,elapsed=0;
    let paused=false,visible=true,disposed=false,frame=0,lastTime=0,lastDraw=0,requestVersion=0,lastFocus=null,hadError=false,preloadStarted=false;
    const triggers=[];canvas.id=canvas.id||'legat-practice-canvas-'+Date.now().toString(36)+'-'+(++serial);
    CONFIG.directions.forEach(item=>region.querySelectorAll('.'+item.triggerClass+', [data-legat-direction="'+item.id+'"]').forEach(el=>{
      if(triggers.some(t=>t.el===el))return;const inner=el.matches('a,button')?el:el.querySelector('a[href],button'),focus=inner||el;
      el.classList.add('legat-practice-trigger');if(el.dataset.elemType==='shape'||el.classList.contains('legat-practice-dot'))el.classList.add('legat-practice-node');
      if(el.classList.contains('legat-practice-node')&&!focus.hasAttribute('aria-label'))focus.setAttribute('aria-label','Выбрать '+item.label);
      if(!inner){el.setAttribute('role','button');el.tabIndex=0;}
      [el,focus].forEach(target=>{target.setAttribute('aria-controls',canvas.id);target.setAttribute('aria-expanded','false');});
      triggers.push({el,focus,id:item.id});
      el.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){lastFocus=focus;select(item.id);}},options);
      el.addEventListener('click',e=>{e.preventDefault();lastFocus=focus;select(item.id);},options);
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();lastFocus=focus;select(item.id);}},options);
    }));
    function emit(phase){root.dataset.phase=phase;root.dataset.selected=requested||'';root.dispatchEvent(new CustomEvent('legat:practice:change',{bubbles:true,detail:{id:requested,activeId:visualId,phase}}));}
    function setStatus(message,busy){status.textContent=message;root.setAttribute('aria-busy',String(!!busy));}
    function updateTriggers(){triggers.forEach(t=>{const active=t.id===requested;t.el.classList.toggle('legat-practice-selected',active);t.el.setAttribute('aria-expanded',String(active));t.focus.setAttribute('aria-expanded',String(active));});}
    function ringSnapshot(){
      const positions=new Float32Array(COUNT*2),colours=new Float32Array(COUNT*4),m=matrix(camera(angle,elapsed,pointer)),density=Math.min(1,6500/COUNT);
      for(let i=0;i<COUNT;i++){const p=project(ring[i*3],ring[i*3+1],ring[i*3+2],m),q=i*4;positions[i*2]=p[0];positions[i*2+1]=p[1];colours[q]=(gold[i]?152:209)/255;colours[q+1]=(gold[i]?136:210)/255;colours[q+2]=(gold[i]?106:202)/255;colours[q+3]=(.17+clamp((p[2]+1.35)/2.7,0,1)*.57)*density;}
      return {positions,colours,pointSize:1.02};
    }
    function snapshot(){
      if(!transition)return visualId?settled:ringSnapshot();
      const t=transition,p=progress,r=t.cohesion?smoothstep(clamp((p-.45)/.55,0,1)):p,positions=new Float32Array(COUNT*2),colours=new Float32Array(COUNT*4);
      for(let k=0;k<positions.length;k++){const to=t.smoothPositions[k]+(t.to.positions[k]-t.smoothPositions[k])*r;positions[k]=t.from.positions[k]+(to-t.from.positions[k])*p;}
      for(let k=0;k<colours.length;k++)colours[k]=t.from.colours[k]+(t.to.colours[k]-t.from.colours[k])*r;
      return {positions,colours,pointSize:t.from.pointSize+(t.to.pointSize-t.from.pointSize)*p};
    }
    function arrangeTarget(from,asset){
      const order=new Uint32Array(COUNT),keys=new Uint32Array(COUNT),positions=new Float32Array(COUNT*2),colours=new Float32Array(COUNT*4);
      for(let i=0;i<COUNT;i++){order[i]=i;keys[i]=hilbert(clamp(Math.floor(from.positions[i*2]/600*255),0,255),clamp(Math.floor(from.positions[i*2+1]/600*255),0,255));}
      order.sort((a,b)=>keys[a]-keys[b]);
      for(let i=0;i<COUNT;i++){const index=order[i];positions[index*2]=asset.positions[i*2];positions[index*2+1]=asset.positions[i*2+1];for(let c=0;c<4;c++)colours[index*4+c]=asset.colours[i*4+c];}
      return {positions,colours,pointSize:asset.pointSize};
    }
    function cohesiveTarget(to){
      const result=new Float32Array(COUNT*2),radius=90,length=COUNT/6,windowSize=181;
      for(let group=0;group<6;group++){const start=group*length,end=start+length,wrap=i=>start+((i-start)%length+length)%length;let sx=0,sy=0;
        for(let j=-radius;j<=radius;j++){const k=wrap(start+j)*2;sx+=to.positions[k];sy+=to.positions[k+1];}
        for(let i=start;i<end;i++){result[i*2]=sx/windowSize;result[i*2+1]=sy/windowSize;const remove=wrap(i-radius)*2,add=wrap(i+radius+1)*2;sx+=to.positions[add]-to.positions[remove];sy+=to.positions[add+1]-to.positions[remove+1];}}
      return result;
    }
    function begin(destination,asset){
      const wasPureRing=!transition&&!visualId,from=snapshot(),to=destination?arrangeTarget(from,asset):ringSnapshot(),cohesion=!!destination&&wasPureRing;
      const duration=destination?(wasPureRing?1.45:1.2):Math.max(.3,transition&&transition.destination?1.05*progress:1.05);
      transition={from,to,destination,cohesion,smoothPositions:cohesion?cohesiveTarget(to):to.positions,time:0,duration};lastUpload=transition;progress=0;
      renderer.upload(transition);setStatus('',false);emit('morphing');
      if(reduced.matches)finish();else start();draw();
    }
    function finish(){
      if(!transition)return;visualId=transition.destination;settled=visualId?transition.to:null;transition=null;progress=visualId?1:0;root.dataset.active=visualId||'';
      const item=CONFIG.directions.find(d=>d.id===visualId);canvas.setAttribute('aria-label',item?'Каркасный арт: '+item.label:'Три переплетённых геометрических кольца');
      emit(requested!==visualId?(hadError?'error':'loading'):(visualId?'art':'rings'));draw();
    }
    function select(id){
      if(disposed)return;
      if(id===requested&&!hadError)return;
      hadError=false;requested=id;const version=++requestVersion;updateTriggers();reset.hidden=!id&&!visualId&&!transition;
      if(!id){setStatus('',false);if(!visualId&&!transition){emit('rings');draw();start();}else begin(null,null);return;}
      if(assets.has(id)){begin(id,assets.get(id));return;}
      setStatus('Загружаем рисунок…',true);emit('loading');start();
      loadAsset(id).then(asset=>{if(disposed||version!==requestVersion||requested!==id)return;begin(id,asset);}).catch(()=>{
        if(disposed||version!==requestVersion||requested!==id)return;hadError=true;setStatus('Рисунок не загрузился. Нажмите направление ещё раз.',false);emit('error');draw();
      });
    }
    function draw(){
      const idle=!visualId&&!transition,size=transition?transition.from.pointSize+(transition.to.pointSize-transition.from.pointSize)*progress:visualId?settled.pointSize:1.02;
      renderer.draw(camera(angle,elapsed,pointer),idle,transition?progress:1,size,!!(transition&&transition.cohesion));
      root.dataset.progress=(transition?progress:visualId?1:0).toFixed(3);pause.hidden=reduced.matches||!!requested||!!visualId||!!transition;reset.hidden=!requested&&!visualId&&!transition;
    }
    function stop(){cancelAnimationFrame(frame);frame=0;lastTime=lastDraw=0;}
    function start(){if(disposed||frame||!visible||document.hidden||!root.isConnected)return;if(!transition&&(visualId||paused||reduced.matches))return;lastTime=lastDraw=0;frame=requestAnimationFrame(tick);}
    function tick(time){frame=0;if(!root.isConnected){dispose();return;}if(!visible||document.hidden){stop();return;}
      const interval=1000/(renderer.type==='canvas'?20:30);
      if(!lastDraw||time-lastDraw>=interval){const dt=lastTime?Math.min((time-lastTime)/1000,.1):0;lastTime=lastDraw=time;
        if(transition){transition.time+=dt;const t=Math.min(1,transition.time/transition.duration);progress=smoothstep(t);if(t===1)finish();}
        else if(!visualId&&!paused&&!reduced.matches){elapsed+=dt;angle+=dt*.085;const s=1-Math.exp(-3*dt);pointer.x+=(aim.x-pointer.x)*s;pointer.y+=(aim.y-pointer.y)*s;}
        draw();}
      if(transition||(!visualId&&!paused&&!reduced.matches))frame=requestAnimationFrame(tick);
    }
    function back(){select(null);if(lastFocus)lastFocus.focus({preventScroll:true});}
    reset.addEventListener('click',back,options);region.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')select(null);},options);
    region.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();back();}},options);
    pause.addEventListener('click',()=>{paused=!paused;pause.textContent=paused?'Продолжить':'Пауза';pause.setAttribute('aria-pressed',String(paused));if(paused&&!transition)stop();else start();},options);
    root.addEventListener('pointermove',e=>{if(visualId||transition||reduced.matches||e.pointerType==='touch')return;const box=root.getBoundingClientRect();if(box.width&&box.height){aim.x=2*(e.clientX-box.left)/box.width-1;aim.y=2*(e.clientY-box.top)/box.height-1;}},options);
    root.addEventListener('pointerleave',()=>{aim.x=aim.y=0;},options);
    root.addEventListener('legat:practice:select',e=>{if(e.detail&&(e.detail.id===null||CONFIG.directions.some(d=>d.id===e.detail.id)))select(e.detail.id);},options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();},options);
    function onReduced(){if(reduced.matches){stop();if(transition)finish();}else start();draw();}reduced.addEventListener('change',onReduced);
    function preload(){if(preloadStarted||root.dataset.preload==='none')return;preloadStarted=true;const ids=root.dataset.preload==='all'?CONFIG.directions.map(d=>d.id):['bjj'];
      let chain=Promise.resolve();ids.forEach(id=>{chain=chain.then(()=>loadAsset(id).catch(()=>{}));});}
    const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){start();setTimeout(()=>{if(!disposed&&visible)preload();},900);}else stop();}):null;
    function resizeDrawing(){const width=root.getBoundingClientRect().width,ratio=Math.min(renderer.type==='canvas'?1.5:2,devicePixelRatio||1),pixels=Math.max(1,Math.round(width*ratio));if(canvas.width!==pixels){canvas.width=canvas.height=pixels;draw();}}
    const resize='ResizeObserver'in window?new ResizeObserver(resizeDrawing):null;
    function dispose(){disposed=true;stop();abort.abort();reduced.removeEventListener('change',onReduced);if(observer)observer.disconnect();if(resize)resize.disconnect();renderer.dispose();instances.delete(root);}
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();stop();const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);renderer.dispose();canvas=fresh;renderer=createCanvas(canvas,ring,gold);root.dataset.renderer='canvas';if(lastUpload)renderer.upload(lastUpload);resizeDrawing();draw();start();
    },options);
    instances.set(root,{select,dispose});if(observer)observer.observe(root);else preload();if(resize)resize.observe(root);resizeDrawing();draw();start();emit('rings');
  });}
  window.LegatPracticeMorph={version:3,registerAsset,init:initialize,select:(root,id)=>{const instance=instances.get(root);if(instance)instance.select(id);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
