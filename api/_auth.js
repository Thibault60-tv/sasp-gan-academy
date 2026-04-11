const crypto=require("crypto");
function parseJson(req){return new Promise(res=>{let d="";req.on("data",c=>d+=c);req.on("end",()=>res(JSON.parse(d||"{}")));});}
function sign(payload,secret){const data=Buffer.from(JSON.stringify(payload)).toString("base64");const sig=crypto.createHmac("sha256",secret).update(data).digest("hex");return data+"."+sig;}
module.exports={parseJson,sign};