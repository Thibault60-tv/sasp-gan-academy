
// ADD Discord embed style upgrade
const embed = {
  title: "🎓 Nouveau certificat",
  color: 15844367,
  fields: [
    { name: "Nom", value: name },
    { name: "Date", value: date },
    { name: "Signature", value: signature },
    ...(comment ? [{ name: "Commentaire", value: comment }] : []),
    { name: "Vérification", value: verifyUrl }
  ],
  footer: { text: "SASP GAN Academy" }
};
