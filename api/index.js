export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const action = url.searchParams.get("action");

  // simple session (NOT secure but works)
  if (!global.sessions) global.sessions = {};

  function json(data){ res.setHeader("Content-Type","application/json"); res.end(JSON.stringify(data)); }

  async function readBody(){
    return new Promise(resolve=>{
      let body="";
      req.on("data",chunk=>body+=chunk);
      req.on("end",()=>resolve(JSON.parse(body||"{}")));
    });
  }

  if(action==="login"){
    const {username,password} = await readBody();

    const users = {
      admin:{password:"admin123",role:"admin"},
      formateur:{password:"form123",role:"formateur"},
      accueil:{password:"acc123",role:"accueil"}
    };

    if(!users[username] || users[username].password!==password){
      return json({ok:false,error:"bad login"});
    }

    const token = Math.random().toString(36);
    global.sessions[token] = users[username];

    res.setHeader("Set-Cookie",`token=${token}; Path=/`);
    return json({ok:true});
  }

  if(action==="session"){
    const cookie = req.headers.cookie||"";
    const token = cookie.split("token=")[1];
    if(!token || !global.sessions[token]){
      return json({ok:false});
    }
    return json({ok:true,role:global.sessions[token].role});
  }

  if(action==="logout"){
    res.setHeader("Set-Cookie","token=; Max-Age=0; Path=/");
    return json({ok:true});
  }

  return json({ok:true});
}
