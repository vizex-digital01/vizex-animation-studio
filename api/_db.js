const base=()=>String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const key=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||"");
export function dbReady(){return !!base()&&!!key()}
export async function db(path,{method="GET",body,headers={}}={}){
  if(!dbReady()) throw new Error("Supabase env belum lengkap");
  const r=await fetch(base()+"/rest/v1/"+path,{method,headers:{apikey:key(),Authorization:`Bearer ${key()}`,"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok) throw new Error(typeof data==="object"?(data.message||data.hint||JSON.stringify(data)):String(data||r.status));
  return data;
}
export const q=v=>encodeURIComponent(String(v));
