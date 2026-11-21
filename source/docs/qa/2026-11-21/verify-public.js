async (page) => {
  const errors = [], failed = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) failed.push([r.status(),r.url()]); });
  await page.setViewportSize({width:1920,height:1080});
  await page.addInitScript(() => {
    window.qaLong=[];
    new PerformanceObserver(list => qaLong.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  });
  await page.goto('https://minusplus2025.github.io/wukong-game/?dev=1');
  await page.waitForTimeout(4000);
  const movementMs=await page.evaluate(async()=>{
    document.querySelector('#btn-start-game').click();
    const t=performance.now(),p=__W.hero.root.position.clone();
    dispatchEvent(new KeyboardEvent('keydown',{key:'w'}));
    while(__W.hero.root.position.distanceTo(p)<.01 && performance.now()-t<1000)await new Promise(requestAnimationFrame);
    dispatchEvent(new KeyboardEvent('keyup',{key:'w'}));
    return performance.now()-t;
  });
  await page.evaluate(()=>{window.qaGod=setInterval(()=>{__W.hero.hp=300;__W.hero.mana=100;},50)});
  await page.waitForTimeout(3000);
  const initial=await page.evaluate(async()=>{await __W.startChapter(1);return __W.state()});
  for(let i=0;i<18;i++){await page.keyboard.press('j');await page.waitForTimeout(130)}
  await page.keyboard.press('Shift');await page.keyboard.press('2');await page.keyboard.press('f');
  await page.waitForTimeout(1000);
  await page.evaluate(()=>{for(const e of __W.enemies.enemies)__W.enemies.applyDamage(e,99999)});
  await page.waitForTimeout(1500);
  await page.getByRole('button',{name:'超度 · 放下',exact:true}).click();
  await page.waitForTimeout(4000);
  const afterChoice=await page.evaluate(async()=>{await __W.startChapter(2);return __W.state()});
  await page.evaluate(()=>{__W.unlockAll();clearInterval(qaGod);window.qaGod=setInterval(()=>{__W.hero.hp=300;for(const e of __W.enemies.enemies)e.frozenTimer=99;},50)});
  const cdp=await page.context().newCDPSession(page),samples=[];
  for(const chapter of [0,1,2,1,0]){
    const start=await page.evaluate(async c=>{qaLong=[];const t=performance.now();await __W.startChapter(c);return t},chapter);
    await page.waitForTimeout(6000);
    await cdp.send('HeapProfiler.collectGarbage');
    samples.push(await page.evaluate(async({chapter,start})=>{
      const frames=[];let last=performance.now();for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);let n=performance.now();frames.push(n-last);last=n;}
      frames.sort((a,b)=>a-b);
      return {chapter,heapMB:performance.memory.usedJSHeapSize/1048576,memory:{...__W.renderer.info.memory},fps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),p95:frames[Math.floor(frames.length*.95)],max:Math.max(...frames),long:qaLong.filter(e=>e.start>=start),clips:__W.enemies.enemies.map(e=>({name:e.spec.name,idle:e.actions[e.idleClipIdx]?.getClip().name,move:e.actions[e.moveClipIdx]?.getClip().name,attack:e.actions[e.attackClipIdx]?.getClip().name,model:e.modelWrap.children.length}))};
    },{chapter,start}));
  }
  await cdp.detach();
  const result={movementMs,initial,afterChoice,samples,errors,failed};
  await page.evaluate(r=>window.qaResult=r,result);
  return result;
}
