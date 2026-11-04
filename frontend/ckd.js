'use strict';
// CKD nutrition planning prototype. Equivalent values follow the user-supplied seven-page PDF.
// They are demonstrative; not a validated clinical food database.
(() => {
  const byId = id => document.getElementById(id);
  const roundHalf = n => Math.max(0, Math.round(n * 2) / 2);
  const n = (id, fallback=0) => { const el=byId(id);return el && el.value!=='' && Number.isFinite(Number(el.value)) ? Number(el.value) : fallback; };
  const f = (x,d=1) => Number.isFinite(x) ? x.toFixed(d) : '—';
  const types = [
    {id:'starch',name:'主食類',p:2,c:15,f:0,kcal:68,spec:'醣類約 15 g／份',weight:'依實際食品及生熟狀態換算'},
    {id:'meat',name:'豆魚蛋肉類',p:7,c:0,f:3,kcal:55,spec:'中脂示範，蛋白質 7 g／份',weight:'依實際食品及生熟狀態換算'},
    {id:'oil',name:'油脂類',p:0,c:0,f:5,kcal:45,spec:'食用油約 5 g／份',weight:'每份約 5 g（含烹調用油）'},
    {id:'soy',name:'無糖豆漿',p:7,c:4,f:4,kcal:80,spec:'示範 240 mL／份，待核對品牌',weight:'每份約 240 mL'},
    {id:'veg',name:'蔬菜類',p:1,c:5,f:0,kcal:25,spec:'醣類約 5 g／份',weight:'依實際食品換算'},
    {id:'fruit',name:'水果類',p:0,c:15,f:0,kcal:60,spec:'醣類約 15 g／份',weight:'依實際食品換算'},
    {id:'low',name:'低蛋白澱粉',p:0,c:17.5,f:0,kcal:70,spec:'冬粉乾重示範 15 g／份',weight:'每份約 15 g（乾重）'}
  ];
  const fixed = {soy:1,veg:3,fruit:2};
  const mealNames=['早餐','午餐','晚餐','下午點心'];
  const defaultSplit={starch:[3,4,4,1],meat:[0,1,1,0],oil:[2,3,3,2],soy:[1,0,0,0],veg:[0,1.5,1.5,0],fruit:[0,1,0,1],low:[0,1,.5,.5]};
  let daily={}, meals={}, manualDaily=false, initial=true;
  const field = id => byId(id);
  function getInputs(){
    const cm=n('ck-height',160), kg=n('ck-weight',60), h=cm/100, valid=cm>=100&&cm<=250&&kg>=20&&kg<=400;
    const ideal=22*h*h, mode=field('ck-mode').value;
    const base=field('ck-basis').value==='ideal'?ideal:kg;
    const energyFactor=n('ck-energy',30), fatRatio=n('ck-fat',30)/100;
    const proteinFactor = field('ck-protein').value==='' ? NaN : Number(field('ck-protein').value);
    const clinical = mode==='nondialysis'||field('ck-professional').checked;
    const feasible=valid&&Number.isFinite(proteinFactor)&&proteinFactor>=0.3&&proteinFactor<=2.5&&clinical;
    const kcal=base*energyFactor, protein=base*proteinFactor, fat=kcal*fatRatio/9, carb=(kcal-4*protein-9*fat)/4;
    return {cm,kg,h,valid,ideal,mode,base,energyFactor,fatRatio,proteinFactor,feasible,kcal,protein,fat,carb};
  }
  function totals(q){return types.reduce((a,t)=>{const z=q[t.id]||0; a.kcal+=z*t.kcal;a.p+=z*t.p;a.c+=z*t.c;a.f+=z*t.f;return a;},{kcal:0,p:0,c:0,f:0});}
  function solve(s){
    // All adjustable portions are multiples of 0.5. Minimize target gaps; never add oil beyond fat prescription to compensate for energy shortfall.
    const cap=n('ck-low-cap',5);let best=null;
    for(let st=0;st<=Math.min(25,Math.max(12,Math.ceil(s.kcal/68)));st+=.5){
      const meat=roundHalf((s.protein-10-st*2)/7);
      if(meat>18)continue;
      for(let lp=0;lp<=cap;lp+=.5){
        const nonOilFat=4+meat*3;
        const oil=roundHalf((s.fat-nonOilFat)/5);
        const q={starch:st,meat,oil,soy:1,veg:3,fruit:2,low:lp};
        const t=totals(q);
        const score=Math.abs(t.kcal-s.kcal)*1.0+Math.abs(t.p-s.protein)*15+Math.abs(t.c-s.carb)*1.1+Math.abs(t.f-s.fat)*8+Math.max(0,t.f-s.fat)*12;
        if(!best||score<best.score)best={q,score};
      }
    }
    return best?.q||{starch:0,meat:0,oil:0,soy:1,veg:3,fruit:2,low:0};
  }
  function distribute(q){
    let m={};
    for(const t of types){
      const base=defaultSplit[t.id];
      let amounts=[0,0,0,0];let left=Math.round(q[t.id]*2);
      const w=base.map(x=>x/Math.max(.5,base.reduce((a,b)=>a+b,0)));
      // Largest remainder allocation maintains exact total and 0.5-increments.
      const raw=w.map(x=>x*left);amounts=raw.map(v=>Math.floor(v));
      let rem=left-amounts.reduce((a,b)=>a+b,0);
      const order=[0,1,2,3].sort((a,b)=>(raw[b]-Math.floor(raw[b]))-(raw[a]-Math.floor(raw[a])));
      for(let i=0;i<rem;i++)amounts[order[i%4]]++;
      m[t.id]=amounts.map(v=>v/2);
    }
    return m;
  }
  function renderDaily(s){
    field('ck-daily-body').innerHTML=types.map(t=>{
      const val=daily[t.id]??0,locked=Object.hasOwn(fixed,t.id);
      let wt= t.id==='oil'?`${f(val*5)} g（約）`:t.id==='soy'?`${f(val*240)} mL（示範）`:t.id==='low'?`${f(val*15)} g（乾重）`:t.weight;
      return `<tr><th>${t.name}${locked?' <small>（固定）</small>':''}</th><td><input class="ck-share" type="number" data-share="${t.id}" min="0" max="50" step="0.5" value="${val}" ${locked?'disabled':''} aria-label="${t.name} 每日份數"></td><td>${t.spec}</td><td>${t.p} g</td><td>${t.kcal} kcal</td><td>${wt}</td></tr>`;
    }).join('');
    const t=totals(daily);
    field('ck-daily-totals').innerHTML=`<div><span>食物合計熱量</span><strong>${f(t.kcal,0)} kcal</strong></div><div><span>食物合計蛋白質</span><strong>${f(t.p)} g</strong></div><div><span>食物合計醣類</span><strong>${f(t.c)} g</strong></div><div><span>食物合計脂肪</span><strong>${f(t.f)} g</strong></div>`;
    const dif=(a,b,unit)=>`${a-b>=0?'超出':'不足'} ${f(Math.abs(a-b))} ${unit}`;
    field('ck-gap').textContent=`熱量：${dif(t.kcal,s.kcal,'kcal')}｜蛋白質：${dif(t.p,s.protein,'g')}｜醣類：${dif(t.c,s.carb,'g')}｜脂肪：${dif(t.f,s.fat,'g')}`;
    field('ck-supplement').innerHTML=`低蛋白澱粉 ${f(daily.low)} 份 ≈ ${f(daily.low*15)} g（乾重）、約 ${f(daily.low*70,0)} kcal；植物油合計 ${f(daily.oil)} 份 ≈ ${f(daily.oil*5)} g、約 ${f(daily.oil*45,0)} kcal。<strong>油脂已包含在總油脂份數，不是額外添加。</strong>`;
    const remain=s.protein-(fixed.soy*7+fixed.veg*1+daily.starch*2);
    field('ck-protein-steps').innerHTML=`① 每日蛋白質目標 <b>${f(s.protein)} g</b><br>② 扣除豆漿 1 份：7.0 g<br>③ 扣除蔬菜 3 份：3.0 g；主食 ${f(daily.starch)} 份：${f(daily.starch*2)} g<br>④ 剩餘蛋白質額度：<b>${f(remain)} g</b><br>⑤ 豆魚蛋肉理論份數 ${f(Math.max(0,remain/7))}，實際分配 <b>${f(daily.meat)} 份</b>（每份 7 g）`;
    const bad=Math.abs(t.p-s.protein)>2.5||Math.abs(t.kcal-s.kcal)>120||Math.abs(t.f-s.fat)>5||t.f>s.fat+2.5;
    field('ck-warning').textContent=bad?'⚠ 這組食物份數尚未貼近熱量、蛋白質或脂肪目標，需營養師重新配置；不可只加油湊熱量。':'✓ 試算組合接近設定目標，仍須以實際食品和個案狀態核對。';
    field('ck-warning').className=bad?'ck-warning bad':'ck-warning';
  }
  function renderMeals(){
    field('ck-meal-head').innerHTML='<tr><th>類別</th>'+mealNames.map(x=>`<th>${x}</th>`).join('')+'<th>餐次合計 / 每日</th></tr>';
    field('ck-meal-body').innerHTML=types.map(t=>{
      const arr=meals[t.id]||[0,0,0,0], sum=arr.reduce((a,b)=>a+b,0),goal=daily[t.id]||0, mismatch=Math.abs(sum-goal)>.01;
      return `<tr><th>${t.name}</th>${arr.map((v,i)=>`<td><input type="number" class="ck-meal-input" data-meal-id="${t.id}" data-meal-index="${i}" min="0" max="50" step="0.5" value="${v}" aria-label="${t.name} ${mealNames[i]} 份數"></td>`).join('')}<td class="${mismatch?'ck-mismatch':''}">${f(sum)} / ${f(goal)}</td></tr>`;
    }).join('');
    const mismatches=types.filter(t=>Math.abs((meals[t.id]||[]).reduce((a,b)=>a+b,0)-(daily[t.id]||0))>.01);
    field('ck-meal-status').textContent=mismatches.length?'⚠ 餐次份數尚未符合每日目標：'+mismatches.map(t=>t.name).join('、'):'✓ 所有餐次份數加總等於每日份數。';
    field('ck-meal-status').className=mismatches.length?'ck-warning bad':'ck-warning';
    const each=mealNames.map((label,i)=>{const q={};types.forEach(t=>q[t.id]=meals[t.id]?.[i]||0);return {label,q,t:totals(q)};});
    field('ck-meal-cards').innerHTML=each.map(x=>`<div class="ck-meal-card"><b>${x.label}</b><strong>${f(x.t.kcal,0)} kcal</strong><small>蛋白質 ${f(x.t.p)} g｜醣類 ${f(x.t.c)} g｜脂肪 ${f(x.t.f)} g</small><small>主食 ${f(x.q.starch)} 份・豆魚蛋肉 ${f(x.q.meat)} 份<br>冬粉示範 ${f(x.q.low*15)} g（乾）・油脂 ${f(x.q.oil*5)} g</small></div>`).join('');
  }
  function update(reset=true){
    const s=getInputs();
    field('ck-protein-range').textContent=s.mode==='nondialysis'?`${f(s.base*.6)}–${f(s.base*.8)} g（示範參考區間）`:'須個別處方';
    field('ck-mode-warning').textContent=s.mode==='nondialysis'?'未透析 CKD G3–G5：PDF 使用 0.6–0.8 g/kg 作可調試算區間；0.6 並非所有患者適用，KDIGO 2024 一般參考 0.8 g/kg。':'透析模式不沿用未透析低蛋白公式：需由營養師輸入處方係數並勾選已確認。';
    const error=!s.valid?'請輸入有效身高 100–250 cm、體重 20–400 kg。':!s.feasible?'請確認蛋白質係數；透析模式須由營養師勾選已確認處方。':s.carb<0?'此熱量／蛋白質／脂肪設定無法形成非負醣類，請重新評估。':'';
    field('ck-error').textContent=error;
    ['ck-bmi','ck-ideal','ck-kcal','ck-p','ck-carb','ck-fat-g'].forEach(id=>field(id).textContent='—');
    if(error){field('ck-results').hidden=true;return;}
    field('ck-results').hidden=false;
    field('ck-bmi').textContent=f(s.kg/(s.h*s.h));field('ck-ideal').textContent=f(s.ideal)+' kg';field('ck-kcal').textContent=f(s.kcal,0)+' kcal';field('ck-p').textContent=f(s.protein)+' g';field('ck-carb').textContent=f(s.carb)+' g';field('ck-fat-g').textContent=f(s.fat)+' g';
    field('ck-formula').textContent=`計算體重 ${f(s.base)} kg；熱量 ${f(s.energyFactor,0)} kcal/kg；蛋白質 ${f(s.proteinFactor,2)} g/kg；脂肪 ${f(s.fatRatio*100,0)}%。`;
    if(reset||initial){daily=solve(s);meals=distribute(daily);manualDaily=false;initial=false;}
    renderDaily(s);renderMeals();
  }
  function init(){
    const fromCalculator=()=>{const cm=byId('height')?.value,kg=byId('weight')?.value;if(cm)field('ck-height').value=cm;if(kg)field('ck-weight').value=kg;};
    field('ck-copy').addEventListener('click',()=>{fromCalculator();update();});
    field('ck-mode').addEventListener('change',()=>{field('ck-professional').checked=false;field('ck-protein').value=field('ck-mode').value==='nondialysis'?'0.8':'';update();});
    ['ck-height','ck-weight','ck-energy','ck-protein','ck-fat','ck-basis','ck-low-cap','ck-professional'].forEach(id=>['input','change'].forEach(evt=>field(id).addEventListener(evt,()=>update(true))));
    field('ck-daily-body').addEventListener('change',e=>{if(!e.target.matches('[data-share]'))return;const id=e.target.dataset.share,val=Number(e.target.value);if(!Number.isFinite(val)||val<0||val>50||Math.abs(val*2-Math.round(val*2))>1e-8){e.target.value=daily[id];field('ck-edit-error').textContent='份數必須為 0～50，且以 0.5 份為單位。';return;}field('ck-edit-error').textContent='';daily[id]=val;const s=getInputs();renderDaily(s);renderMeals();});
    field('ck-reset').addEventListener('click',()=>update(true));
    field('ck-meal-auto').addEventListener('click',()=>{meals=distribute(daily);renderMeals();});
    field('ck-meal-body').addEventListener('change',e=>{if(!e.target.matches('[data-meal-id]'))return;const id=e.target.dataset.mealId,index=Number(e.target.dataset.mealIndex),val=Number(e.target.value);if(!Number.isFinite(val)||val<0||val>50||Math.abs(val*2-Math.round(val*2))>1e-8){e.target.value=meals[id][index];return;}meals[id][index]=val;renderMeals();});
    field('ck-print').addEventListener('click',()=>window.print());
    update(true);
  }
  document.addEventListener('DOMContentLoaded',init);
  window.updateCKD=()=>{}; // CKD has independent input controls; use the copy button to synchronize.
})();
