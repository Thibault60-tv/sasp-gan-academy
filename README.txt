SASP GAN Academy - Vercel PRO ADMIN + Supabase

Ce pack ajoute un stockage persistant via Supabase.

Contenu:
- index.html
- login.html
- admin.html
- api/_auth.js
- api/login.js
- api/logout.js
- api/submit-application.js
- api/send-certificate.js
- api/applications.js
- api/logs.js
- supabase_schema.sql
- .env.example
- README.txt

Ce que cette version apporte:
- Connexion admin avec session signée
- Webhook Discord caché côté serveur
- Candidatures persistantes en base
- Journal d'actions persistant
- Panel admin privé
- Certificats envoyés depuis le panel

Déploiement:
1. Crée un projet Supabase.
2. Ouvre SQL Editor et exécute le contenu de supabase_schema.sql
3. Crée un repo GitHub avec ce pack.
4. Importe le repo dans Vercel.
5. Dans Vercel > Settings > Environment Variables ajoute:
   - DISCORD_WEBHOOK_URL
   - ADMIN_USERNAME
   - ADMIN_PASSWORD
   - ADMIN_TOKEN_SECRET
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY

Variables:
- SUPABASE_URL = URL du projet Supabase
- SUPABASE_SERVICE_ROLE_KEY = clé service role (à garder secrète)

Important:
- Ne mets jamais la SERVICE ROLE KEY dans le front.
- Garde les appels Supabase uniquement dans /api.

Étape suivante possible:
- validation/refus de candidature
- suppression d'entrées
- comptes multi-admin
- rôles instructeur/commandement
- upload de fichiers ou certificats PDF
