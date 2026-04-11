SASP GAN Academy - Vercel secure version

Contenu:
- index.html
- api/verify-admin.js
- api/submit-application.js
- api/send-certificate.js
- .env.example

Ce que cette version sécurise:
- Le webhook Discord n'est plus dans le HTML.
- Le mot de passe admin n'est plus dans le HTML.
- Le déverrouillage admin passe par /api/verify-admin.
- L'envoi du certificat vers Discord exige un cookie HttpOnly signé côté serveur.

Déploiement Vercel:
1. Crée un repo GitHub et envoie tout le contenu.
2. Importe le repo dans Vercel.
3. Dans Vercel > Settings > Environment Variables, ajoute:
   - DISCORD_WEBHOOK_URL = ton webhook Discord
   - CERTIFICATE_PASSWORD = ton mot de passe admin
   - ADMIN_TOKEN_SECRET = une longue clé aléatoire
4. Redeploy.

Notes:
- index.html suppose que ton logo est dans assets/logo.png
- Les candidatures partent vers /api/submit-application
- Le certificat admin se déverrouille via /api/verify-admin
- L'envoi du certificat part via /api/send-certificate

Conseil:
- Mets un vrai lien Discord dans academyConfig.discordUrl
- Garde ton repo privé si possible
