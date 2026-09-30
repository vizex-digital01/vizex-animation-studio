import fs from "fs";
import path from "path";
import { auth } from "./_auth.js";

export default function handler(req,res){
  try{
    const u=auth(req);
    if(!u){
      res.statusCode=302;
      res.setHeader("Location","/");
      return res.end();
    }

    const file=path.join(process.cwd(),"private","app.html");

    if(!fs.existsSync(file)){
      console.error("Vizex app file missing:", file);
      return res.status(500).json({
        error:"private/app.html tidak ikut ter-bundle di Vercel"
      });
    }

    let html=fs.readFileSync(file,"utf8");
    html=html.replace("</head>",`<!-- Licensed to ${u.email} --></head>`);

    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","no-store, max-age=0");
    return res.status(200).send(html);
  }catch(e){
    console.error("Vizex /api/app error:",e);
    return res.status(500).json({error:"Gagal membuka Vizex app"});
  }
}
