SASP GAN Academy - Vercel PRO ADMIN

Contenu:
- index.html (redirige vers login)
- login.html
- admin.html
- api/_auth.js
- api/login.js
- api/logout.js
- api/submit-application.js
- api/send-certificate.js
- api/applications.js
- api/logs.js
- .env.example

Fonctions:
- Connexion admin avec identifiant + mot de passe
- Session via cookie HttpOnly signé
- Panel admin séparé
- Envoi certificat vers Discord depuis le panel
- Candidatures consultables côté admin
- Journal d'actions consultable côté admin
- Webhook Discord caché côté serveur

Déploiement Vercel:
1. Mets tous les fichiers dans un repo GitHub.
2. Importe le repo dans Vercel.
3. Dans Settings > Environment Variables ajoute:
   - DISCORD_WEBHOOK_URL
   - ADMIN_USERNAME
   - ADMIN_PASSWORD
   - ADMIN_TOKEN_SECRET

Exemple:
DISCORD_WEBHOOK_URL=ton_webhook
ADMIN_USERNAME=admin_sasp
ADMIN_PASSWORD=mot_de_passe_tres_solide
ADMIN_TOKEN_SECRET=cle_aleatoire_longue_et_unique

Notes importantes:
- Les tableaux candidatures/logs ici utilisent la mémoire runtime. Sur Vercel serverless, ils peuvent se réinitialiser entre déploiements ou réveils.
- Pour un stockage durable, branche ensuite une base comme Upstash Redis, Neon, Supabase ou Postgres.
- Le logo est attendu dans assets/logo.png

Étape suivante possible:
- version avec base de données persistante
- comptes multi-admin
- rôles instructeur / commandement
- suppression / validation des candidatures
