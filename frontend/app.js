'use strict';
const $ = id => document.getElementById(id);
const number = id => Number($(id).value);
const fmt = n => n.toFixed(1);
let currentPhoto = null;
let foods = [];
let photoObjectURL = null; // 預覽用；辨識在使用者瀏覽器內進行

function stats(){
  const cm=number('height'), kg=number('weight'), factor=number('factor'), h=cm/100;
  if (!$('height').value || !$('weight').value || !$('factor').value || !Number.isFinite(cm+kg+factor) || cm<100 || cm>250 || kg<20 || kg>400 || factor<0.3 || factor>3) return null;
  const bmi=kg/(h*h), ideal=22*h*h, base=$('basis').value==='actual'?kg:ideal;
  return {kg,h,bmi,ideal,base,factor};
}
function updateCalc(){
  const s=stats(); $('calc-error').textContent=s?'':'請輸入有效身高（100–250 cm）、體重（20–400 kg）及係數（0.3–3）。';
  if(!s){for(const id of ['bmi','bmi-class','ideal','normal-range','daily-protein','protein-formula']) $(id).textContent='—'; return;}
  $('bmi').textContent=fmt(s.bmi);
  $('bmi-class').textContent=s.bmi<18.5?'體重過輕':s.bmi<24?'正常範圍':s.bmi<27?'體重過重':s.bmi<30?'輕度肥胖':s.bmi<35?'中度肥胖':'重度肥胖';
  $('ideal').textContent=fmt(s.ideal)+' kg';
  $('normal-range').textContent='BMI 18.5～未滿 24：約 '+fmt(18.5*s.h*s.h)+'～'+fmt(24*s.h*s.h)+' kg';
  $('daily-protein').textContent=fmt(s.base*s.factor)+' g/天';
  $('protein-formula').textContent=fmt(s.base)+' kg × '+fmt(s.factor)+' g/kg/天';
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderFoods(){
  $('food-list').innerHTML=foods.map((food,i)=>`<div class="food-row" data-index="${i}"><label>食物名稱<input data-key="name" value="${escapeHTML(food.name)}" aria-label="食物 ${i+1} 名稱"></label><label>份量（g）<input data-key="grams" type="number" min="0" max="5000" step="1" value="${food.grams ?? ''}" aria-label="食物 ${i+1} 份量"></label><label>蛋白質（g / 100g）<input data-key="proteinPer100g" type="number" min="0" max="100" step="0.1" value="${food.proteinPer100g ?? ''}" aria-label="食物 ${i+1} 每百克蛋白質"></label><button class="remove" data-remove="${i}" aria-label="移除食物 ${i+1}">×</button></div>`).join('');
  recalcFoods();
}
function recalcFoods(){const sum=foods.reduce((a,f)=>a+(Number(f.grams)||0)*(Number(f.proteinPer100g)||0)/100,0);const unknown=foods.some(f=>f.proteinPer100g==null || f.grams==null);$('food-total').textContent=fmt(sum)+' g'+(unknown?'（不含營養資料未匹配的食物）':'');}
function addFood(food={name:'新食物（請修改）',grams:100,proteinPer100g:0}){
  foods.push({name:String(food.name||'待確認食物').slice(0,100),grams:food.grams==null?null:Math.min(5000,Math.max(0,Number(food.grams)||0)),proteinPer100g:food.proteinPer100g==null?null:Math.min(100,Math.max(0,Number(food.proteinPer100g)||0))});renderFoods();}
async function analyzePhoto(){
  if(!currentPhoto) return;
  const btn=$('analyze');
  btn.disabled=true;
  $('ai-results').hidden=true;
  $('ai-status').textContent='正在載入免費食物辨識模型（首次下載約 93 MB，依網路與裝置效能可能較久）…';
  try {
    // 動態載入只會在訪客主動按下辨識後進行，避免干擾 BMI/CKD 功能。
    const module = await import('./food-ai.js');
    const candidates = await module.classifyFood(currentPhoto, message => { $('ai-status').textContent=message; });
    if(!candidates.length)throw new Error('沒有取得有效的食物候選結果');
    const container=$('ai-candidates');
    container.replaceChildren();
    candidates.forEach((food,i)=>{
      const row=document.createElement('div');row.className='ai-candidate';
      const label=document.createElement('div');
      const title=document.createElement('strong');title.textContent=food.zh || food.label;
      const sub=document.createElement('small');sub.textContent=`${food.label.replace(/_/g,' ')} · 模型分類分數 ${(food.score*100).toFixed(1)}%`;
      label.append(title,sub);
      const select=document.createElement('button');select.className='secondary';select.type='button';select.textContent='選擇這項';
      select.addEventListener('click',()=>{
        addFood({name:food.zh||food.label.replace(/_/g,' '),grams:null,proteinPer100g:null});
        $('ai-status').textContent='已加入「'+(food.zh||food.label)+'」。請在下方填入實際重量與核對過的每百克蛋白質。';
        $('ai-results').hidden=true;
      });
      row.append(label,select);container.append(row);
    });
    $('ai-results').hidden=false;
    $('ai-status').textContent='模型已在本機完成分類。請選擇符合照片的一項，或改為手動輸入。';
  }catch(err){
    console.error('Browser food classification failed',err);
    $('ai-status').textContent='免費 AI 無法啟動：'+(err.message||'未知錯誤')+'。可改用下方手動記錄。請確認網路連線與瀏覽器可下載模型。';
  }finally{btn.disabled=!currentPhoto;}
}
function setTab(id){document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.tab===id;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false');});document.querySelectorAll('.tab-pane').forEach(p=>{p.hidden=p.id!==id;p.classList.toggle('active',p.id===id);});}
function init(){
  ['height','weight','basis','factor'].forEach(id=>['input','change'].forEach(evt=>$(id).addEventListener(evt,updateCalc)));
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  $('add-item').addEventListener('click',()=>addFood());
  $('food-list').addEventListener('input',e=>{const row=e.target.closest('[data-index]');if(!row||!e.target.dataset.key)return;const idx=Number(row.dataset.index), key=e.target.dataset.key;let v=e.target.value;if(key!=='name')v=v===''?null:Math.max(0,Math.min(key==='grams'?5000:100,Number(v)||0));foods[idx][key]=v;recalcFoods();});
  $('food-list').addEventListener('click',e=>{const btn=e.target.closest('[data-remove]');if(!btn)return;foods.splice(Number(btn.dataset.remove),1);renderFoods();});
  $('ai-none').addEventListener('click',()=>{$('ai-results').hidden=true;addFood({name:'待確認食物',grams:null,proteinPer100g:null});$('ai-status').textContent='已新增待確認食物。請自行輸入食物名稱、重量與營養值。';});
  $('photo').addEventListener('change',e=>{
    const file=e.target.files?.[0]; currentPhoto=null; $('analyze').disabled=true; $('ai-results').hidden=true;
    if(photoObjectURL){URL.revokeObjectURL(photoObjectURL);photoObjectURL=null;}
    if(!file){$('preview').hidden=true;return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('ai-status').textContent='僅支援 5 MB 以下的 JPG、PNG 或 WEBP。';e.target.value='';$('preview').hidden=true;return;}
    currentPhoto=file;photoObjectURL=URL.createObjectURL(file);$('preview').src=photoObjectURL;$('preview').hidden=false;$('analyze').disabled=false;
    $('ai-status').textContent='已選擇照片，按「免費 AI 辨識照片」即可在這台裝置分類；不會自動上傳照片。';
  });
  $('analyze').addEventListener('click',analyzePhoto);renderFoods();updateCalc();
}
document.addEventListener('DOMContentLoaded',init);
