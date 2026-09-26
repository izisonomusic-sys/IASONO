# Izisono V16 — FCFA + exemples IA + conservation des fonctionnalités

## Changements
- Les prix des Notes sont maintenant affichés directement en **FCFA/XOF**.
- Le pack Découverte affiche **4 Notes = 1 900 FCFA** (2 chansons).
- Le pack Populaire affiche **10 Notes = 3 490 FCFA** (5 chansons).
- Le pack Premium affiche **24 Notes = 9 990 FCFA** (12 chansons).
- Le backend PayDunya continue de facturer en **XOF** : aucune modification du flux de paiement, des callbacks, de la vérification ou des fonctions Supabase de crédit.
- Affichage direct en FCFA/XOF, sans conversion de devise côté interface.
- Les deux copies du frontend (source et `izisono-server/public`) restent synchronisées.
- Explorer indique clairement les exemples IA avec voix et conserve les fichiers audio locaux ainsi que les références vocales libres existantes.

## Fonctionnalités inspirées d'Izimelo déjà présentes/conservées
- Création à partir d'une occasion : anniversaire, mariage, déclaration, réussite, fête, hommage, encouragement et autre.
- Prompt/histoire + paroles optionnelles.
- Styles musicaux africains et urbains : Afrobeat, Amapiano, Zouk, Coupé Décalé, Highlife, Gospel, Rap, R&B, Pop, Acoustique, Lo-fi, Reggae.
- Ambiance, voix féminine/masculine/duo, durée et langue vocale.
- Génération avec Mureka, bibliothèque personnelle, lecture, téléchargement MP3, partage et publication dans Explorer.
- Notes : 2 Notes = 1 chanson.
- Authentification Supabase, profil, notifications et paiement PayDunya.

## Supabase
Ce ZIP ne contient aucune clé secrète et ne peut pas pousser automatiquement vers le projet Supabase sans les identifiants/permissions du projet. Les migrations SQL existantes sont conservées intactes. Après récupération du ZIP, appliquer uniquement les migrations déjà prévues par le projet, sans modifier les fonctions de paiement.
