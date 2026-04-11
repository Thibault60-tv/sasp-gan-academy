SASP GAN Academy - Rebuild total propre

Cette version refait tout en mieux avec UNE seule fonction Vercel.
Elle contourne la limite Hobby sur le nombre de fonctions.

Rôles:
- admin: accès complet
- formateur: certificats + agents
- accueil: candidatures + dépôt

Fichiers:
- index.html
- login.html
- admin.html
- verify.html
- api/index.js
- package.json
- supabase_schema.sql
- .env.example

Installation:
1. Sauvegarder l'ancien projet si besoin
2. Remplacer tout par ce pack
3. Dans Vercel, supprimer les anciens fichiers /api si tu gardes un repo mélangé
4. Garder uniquement api/index.js côté API
5. Exécuter supabase_schema.sql dans Supabase
6. Vérifier les variables Vercel
7. Redeploy

Connexion:
- compte principal via ADMIN_USERNAME / ADMIN_PASSWORD
- comptes staff via le panel admin

Conseil:
- après import, fais un redeploy propre
- puis reconnecte-toi
