const { parseJson, supabaseRequest, requireAdmin } = require("./_auth");
const QRCode = require("qrcode");

module.exports = async (req,res)=>{
  if(!requireAdmin(req,res)) return;

  const body = await parseJson(req);

  const created = await supabaseRequest("certificates",{
    method:"POST",
    body:JSON.stringify([{
      name:body.name,
      date:body.date,
      signature:body.signature
    }])
  });

  const data = await created.json();
  const cert = data[0];

  const url = `${req.headers.origin}/verify.html?id=${cert.id}`;
  const qr = await QRCode.toDataURL(url);

  await fetch(process.env.DISCORD_WEBHOOK_URL,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      content:`Certificat: ${body.name}\nVérification: ${url}`
    })
  });

  res.json({ok:true,qr,url});
};