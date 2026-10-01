import crypto from "crypto";
import {db,q} from "./_db.js";
export function parseCustomers(){try{const a=JSON.parse(process.env.CUSTOMERS_JSON||"[]");return Array.isArray(a)?a:[]}catch{return []}}
export function cookie(req){const out={};for(const p of String(req.headers.cookie||"").split(";")){const i=p.indexOf("=");if(i<0)continue;try{out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}catch{}}return out}
export const tokenHash=t=>crypto.createHash("sha256").update(String(t||"")).digest("hex");
export const newToken=()=>crypto.randomBytes(32).toString("base64url");
export function hashPassword(password){const salt=crypto.randomBytes(16).toString("hex");const h=crypto.scryptSync(String(password),salt,64).toString("hex");return `scrypt$${salt}$${h}`}
export function verifyPassword(password,stored){try{const [v,salt,h]=String(stored||"").split("$");if(v!=="scrypt"||!salt||!h)return false;const got=crypto.scryptSync(String(password),salt,64);const exp=Buffer.from(h,"hex");return got.length===exp.length&&crypto.timingSafeEqual(got,exp)}catch{return false}}
export async function auth(req,{touch=true}={}){
  const token=cookie(req).vizex_session;if(!token)return null;
  const th=tokenHash(token);const now=new Date().toISOString();
  const sessions=await db(`customer_sessions?session_token_hash=eq.${q(th)}&expires_at=gt.${q(now)}&select=id,customer_id,device_id,device_name,last_active,expires_at&limit=1`);
  const s=sessions?.[0];if(!s)return null;
  const users=await db(`customers?id=eq.${q(s.customer_id)}&status=eq.active&select=id,email,name,plan,status,max_devices,created_at&limit=1`);
  const u=users?.[0];if(!u)return null;
  if(touch) db(`customer_sessions?id=eq.${q(s.id)}`,{method:"PATCH",body:{last_active:now},headers:{Prefer:"return=minimal"}}).catch(()=>{});
  return {...u,session_id:s.id,device_id:s.device_id,device_name:s.device_name,session_expires_at:s.expires_at};
}
export function setSessionCookie(res,token,maxAge=7*24*60*60){res.setHeader("Set-Cookie",`vizex_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}; Secure`)}
export function clearSessionCookie(res){res.setHeader("Set-Cookie","vizex_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure")}
