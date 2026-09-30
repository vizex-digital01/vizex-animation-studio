import crypto from "crypto";

export function parseCustomers(){
  try{
    const arr=JSON.parse(process.env.CUSTOMERS_JSON||"[]");
    return Array.isArray(arr)?arr:[];
  }catch(e){return []}
}
export function sign(payload){
  const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig=crypto.createHmac("sha256",process.env.SESSION_SECRET||"CHANGE-ME").update(body).digest("base64url");
  return body+"."+sig;
}
export function verify(token){
  try{
    const [body,sig]=String(token||"").split(".");
    if(!body||!sig)return null;
    const expected=crypto.createHmac("sha256",process.env.SESSION_SECRET||"CHANGE-ME").update(body).digest("base64url");
    if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
    const p=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    if(!p.exp||Date.now()>p.exp)return null;
    return p;
  }catch(e){return null}
}
export function cookie(req){
  const out={};
  for(const part of String(req.headers.cookie||"").split(";")){
    const i=part.indexOf("="); if(i<0)continue;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
export function auth(req){
  return verify(cookie(req).vizex_session);
}
