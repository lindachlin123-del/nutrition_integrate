'use strict';
const $ = id => document.getElementById(id);
const number = id => Number($(id).value);
const fmt = n => n.toFixed(1);
let currentPhoto = null;
let foods = [];
const DEFAULT_AI_ENDPOINT = window.NUTRITION_API_URL || ''; // see config.js

function stats(){
  const cm=number('height'), kg=number('weight'), factor=number('factor'), h=cm/100;
  if (!$('height').value || !$('weight').value || !$('factor').value || !Number.isFinite(cm+kg+factor) || cm<100 || cm>250 || kg<20 || kg>400 || factor<0.3 || factor>3) return null;
  const bmi=kg/(h*h), ideal=22*h*h, base=$('basis').value==='actual'?kg:ideal;
  return {kg,h,bmi,ideal,base,factor};
}
function updateCalc(){
  const s=stats(); $('calc-error').textContent=s?'':'請輸入有效身高（100–250 cm）、體重（20–400 kg）及係數（0.3–3）。';
  if(!s){for(const id of ['bmi','bmi-class','ideal','normal-range','daily-protein','protein-formula']) $(id).textContent='—'; updateRenal();return;}
  $('bmi').textContent=fmt(s.bmi);
  $('bmi-class').textContent=s.bmi<18.5?'體重過輕':s.bmi<24?'正常範圍':s.bmi<27?'體重過重':s.bmi<30?'輕度肥胖':s.bmi<35?'中度肥胖':'重度肥胖';
  $('ideal').textContent=fmt(s.ideal)+' kg';
  $('normal-range').textContent='BMI 18.5～未滿 24：約 '+fmt(18.5*s.h*s.h)+'～'+fmt(24*s.h*s.h)+' kg';
  $('daily-protein').textContent=fmt(s.base*s.factor)+' g/天';
  $('protein-formula').textContent=fmt(s.base)+' kg × '+fmt(s.factor)+' g/kg/天';
  updateRenal();
}
function updateRenal(){
  const type=$('renal-type').value, s=stats(), f=number('renal-factor');
  const descriptions={unknown:'請先確認腎臟病治療狀態。',nondialysis:'KDIGO 2024 CKD G3–G5 未透析參考：0.8 g/kg/天，須個別評估。',hemo:'血液透析蛋白質需求常高於未透析者，需依營養狀態與醫療團隊評估。',peritoneal:'腹膜透析需考量蛋白質流失、營養狀況及醫療團隊評估。'};
  $('renal-guide').textContent=descriptions[type];
  const valid=Boolean(s)&&type!=='unknown'&&$('renal-factor').value.trim()!==''&&Number.isFinite(f)&&f>=0.3&&f<=2.5&&$('renal-ack').checked;
  $('renal-error').textContent= type==='unknown'?'請先選擇治療狀態。':!$('renal-ack').checked?'請先確認已閱讀個別化評估提醒。':!s?'請先至健康計算器輸入有效身高與體重。':!$('renal-factor').value?'請由營養師確認蛋白質係數。':f<0.3||f>2.5?'係數須在 0.3–2.5 之間。':'';
  $('renal-protein').textContent=valid?fmt(($('renal-basis').value==='actual'?s.kg:s.ideal)*f)+' g/天':'—';
  $('renal-formula').textContent=valid?fmt($('renal-basis').value==='actual'?s.kg:s.ideal)+' kg × '+fmt(f)+' g/kg/天（請由營養師確認）':'須確認治療狀態、係數及評估體重';
}
function renalSelection(){
  const defaults={unknown:'',nondialysis:'0.8',hemo:'',peritoneal:''};
  $('renal-factor').value=defaults[$('renal-type').value];
  $('renal-ack').checked=false;
  updateRenal();
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderFoods(){
  $('food-list').innerHTML=foods.map((food,i)=>`<div class="food-row" data-index="${i}"><label>食物名稱<input data-key="name" value="${escapeHTML(food.name)}" aria-label="食物 ${i+1} 名稱"></label><label>份量（g）<input data-key="grams" type="number" min="0" max="5000" step="1" value="${food.grams}" aria-label="食物 ${i+1} 份量"></label><label>蛋白質（g / 100g）<input data-key="proteinPer100g" type="number" min="0" max="100" step="0.1" value="${food.proteinPer100g ?? ''}" aria-label="食物 ${i+1} 每百克蛋白質"></label><button class="remove" data-remove="${i}" aria-label="移除食物 ${i+1}">×</button></div>`).join('');
  recalcFoods();
}
function recalcFoods(){const sum=foods.reduce((a,f)=>a+(Number(f.grams)||0)*(Number(f.proteinPer100g)||0)/100,0);const unknown=foods.some(f=>f.proteinPer100g==null);$('food-total').textContent=fmt(sum)+' g'+(unknown?'（不含營養資料未匹配的食物）':'');}
function addFood(food={name:'新食物（請修改）',grams:100,proteinPer100g:0}){
  foods.push({name:String(food.name||'待確認食物').slice(0,100),grams:Math.min(5000,Math.max(0,Number(food.grams)||0)),proteinPer100g:food.proteinPer100g==null?null:Math.min(100,Math.max(0,Number(food.proteinPer100g)||0))});renderFoods();}
async function analyzePhoto(){
  const endpoint=($('endpoint').value||DEFAULT_AI_ENDPOINT).trim().replace(/\/$/,'');
  if(!currentPhoto || !endpoint) return;
  if(!/^https:\/\//.test(endpoint) && !/^http:\/\/localhost(?::\d+)?$/.test(endpoint)){ $('ai-status').textContent='請輸入 https:// 開頭的 API 網址（本機可用 http://localhost:8000）。';return;}
  const btn=$('analyze');btn.disabled=true;$('ai-status').textContent='辨識中，請勿關閉此頁…';
  try{
    const dataUrl=await toDataURL(currentPhoto);
    const res=await fetch(endpoint+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataUrl})});
    const data=await res.json();if(!res.ok) throw new Error(data.detail||data.error||'無法辨識，請確認後端設定');
    if(!Array.isArray(data.items))throw new Error('後端結果格式錯誤');
    foods=[];data.items.slice(0,12).forEach(item=>addFood({name:item.name, grams:item.grams, proteinPer100g:item.proteinPer100g}));
    $('ai-status').textContent='AI 已產生 '+foods.length+' 筆估算。'+(data.items.some(i=>!i.matched)?'有些食物未對應營養資料，蛋白質尚未納入合計，必須手動補正。':'')+' 請逐項核對。';
  }catch(err){$('ai-status').textContent='辨識失敗：'+(err.message||'請稍後重試')+'；仍可手動記錄。';}
  finally{btn.disabled=!currentPhoto;}
}
function toDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('照片讀取失敗'));r.readAsDataURL(file);});}
function setTab(id){document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.tab===id;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false');});document.querySelectorAll('.tab-pane').forEach(p=>{p.hidden=p.id!==id;p.classList.toggle('active',p.id===id);});}
function init(){
  ['height','weight','basis','factor'].forEach(id=>['input','change'].forEach(evt=>$(id).addEventListener(evt,updateCalc)));
  ['renal-factor','renal-basis','renal-ack'].forEach(id=>['input','change'].forEach(evt=>$(id).addEventListener(evt,updateRenal)));
  $('renal-type').addEventListener('change',renalSelection);
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  $('add-item').addEventListener('click',()=>addFood());
  $('food-list').addEventListener('input',e=>{const row=e.target.closest('[data-index]');if(!row||!e.target.dataset.key)return;const idx=Number(row.dataset.index), key=e.target.dataset.key;let v=e.target.value;if(key!=='name')v=(key==='proteinPer100g'&&v==='')?null:Math.max(0,Math.min(key==='grams'?5000:100,Number(v)||0));foods[idx][key]=v;recalcFoods();});
  $('food-list').addEventListener('click',e=>{const btn=e.target.closest('[data-remove]');if(!btn)return;foods.splice(Number(btn.dataset.remove),1);renderFoods();});
  const saved=localStorage.getItem('nutritionAiEndpoint')||DEFAULT_AI_ENDPOINT;$('endpoint').value=saved;
  $('save-endpoint').addEventListener('click',()=>{const v=$('endpoint').value.trim();if(v&&!/^https:\/\//.test(v) && !/^http:\/\/localhost(?::\d+)?$/.test(v)){$('ai-status').textContent='網址須以 https:// 開頭（本機可用 http://localhost:8000）。';return;}localStorage.setItem('nutritionAiEndpoint',v);$('ai-status').textContent=v?'已在這台裝置儲存網址。':'已清除後端網址。';});
  $('photo').addEventListener('change',e=>{const file=e.target.files?.[0];currentPhoto=null;$('analyze').disabled=true;if(!file){$('preview').hidden=true;return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('ai-status').textContent='僅支援 5 MB 以下的 JPG、PNG 或 WEBP。';e.target.value='';return;}currentPhoto=file;$('preview').src=URL.createObjectURL(file);$('preview').hidden=false;$('analyze').disabled=false;$('ai-status').textContent='已選擇照片。需設定 AI 後端才能辨識；照片不會自動上傳。';});
  $('analyze').addEventListener('click',analyzePhoto);addFood({name:'雞胸肉（示範，請修改）',grams:100,proteinPer100g:23});updateCalc();
}
document.addEventListener('DOMContentLoaded',init);
