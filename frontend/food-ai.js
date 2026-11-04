// 免費瀏覽器內 Food-101 影像分類。照片不送往伺服器。
// 模型：onnx-community/swin-finetuned-food101-ONNX (Apache-2.0)
// 只在呼叫 classifyFood 時才會載入 Transformers.js 和模型。
const MODEL_ID='onnx-community/swin-finetuned-food101-ONNX';
const LIBRARY_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
let classifierPromise;
const ZH={
  grilled_salmon:'烤鮭魚',sushi:'壽司',sashimi:'生魚片',fried_rice:'炒飯',ramen:'拉麵',pho:'越南河粉',bibimbap:'韓式拌飯',
  dumplings:'水餃／餃子',gyoza:'日式煎餃',spaghetti_bolognese:'義大利肉醬麵',spaghetti_carbonara:'培根蛋奶義大利麵',
  pizza:'披薩',hamburger:'漢堡',cheeseburger:'起司漢堡',hot_dog:'熱狗',steak:'牛排',prime_rib:'烤肋排',
  chicken_wings:'雞翅',fried_chicken:'炸雞',grilled_cheese_sandwich:'烤起司三明治',caesar_salad:'凱薩沙拉',greek_salad:'希臘沙拉',
  miso_soup:'味噌湯',seaweed_salad:'海藻沙拉',edamame:'毛豆',omelette:'歐姆蛋',scrambled_eggs:'炒蛋',
  french_fries:'薯條',fried_calamari:'炸魷魚',fish_and_chips:'炸魚薯條',fried_rice:'炒飯',pancakes:'鬆餅',waffles:'格子鬆餅',
  ice_cream:'冰淇淋',donuts:'甜甜圈',apple_pie:'蘋果派',chocolate_cake:'巧克力蛋糕',carrot_cake:'紅蘿蔔蛋糕',
  tacos:'塔可',nachos:'起司玉米片',pad_thai:'泰式炒河粉',spring_rolls:'春捲',baklava:'果仁蜜餅',
  chicken_curry:'咖哩雞',beef_carpaccio:'生牛肉薄片',beef_tartare:'韃靼牛肉',pulled_pork_sandwich:'手撕豬肉三明治'
};
function translate(label){const cleaned=String(label).trim().toLowerCase().replaceAll(' ','_');return ZH[cleaned]||null;}
async function getClassifier(progress){
 if(!classifierPromise){
   classifierPromise=(async()=>{
     const { pipeline }=await import(LIBRARY_URL);
     return pipeline('image-classification',MODEL_ID,{dtype:'q8',device:'wasm',progress_callback:p=>{
       if(p.status==='progress' && Number.isFinite(p.progress)){
         progress(`正在下載食物分類模型：${Math.round(p.progress)}%（首次約 93 MB）`);
       } else if(p.status==='initiate'){progress('正在載入模型檔案，請保持網路連線…');}
     }});
   })().catch(err=>{classifierPromise=null;throw err;});
 }
 return classifierPromise;
}
export async function classifyFood(file,progress=()=>{}){
 if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('請先選擇 JPG、PNG 或 WEBP 圖片');
 const classifier=await getClassifier(progress);
 progress('模型已載入，正在分析這張照片…');
 const url=URL.createObjectURL(file);
 try {
   const result=await classifier(url,{top_k:3});
   if(!Array.isArray(result))throw new Error('模型結果不是預期的列表');
   return result.filter(x=>typeof x.label==='string'&&Number.isFinite(x.score)).slice(0,3).map(x=>({label:x.label,zh:translate(x.label),score:x.score}));
 } finally {URL.revokeObjectURL(url);}
}
