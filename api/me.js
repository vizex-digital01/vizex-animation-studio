import {auth} from "./_auth.js";
export default async function handler(req,res){try{const u=await auth(req);if(!u)return res.status(401).json({error:"Unauthorized"});return res.status(200).json({id:u.id,email:u.email,name:u.name,plan:u.plan,status:u.status,max_devices:u.max_devices,created_at:u.created_at,device_id:u.device_id});}catch(e){return res.status(500).json({error:e.message})}}
