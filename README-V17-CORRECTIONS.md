# IZISONO V17 — corrections

- Réparation UTF-8 de `izisono-server/public/index.html` sans conversion globale risquée.
- Navigation interne stabilisée pour éviter le retour visuel en haut avant le scroll.
- Affichage des prix côté interface forcé en `FCFA`.
- Bouton `🗑 Supprimer` conservé et sécurisé côté UI; la route serveur DELETE `/tracks/:id` existe déjà et n’a pas été remplacée.
- Hero modernisé avec animations CSS, tout en respectant `prefers-reduced-motion`.
- PWA complétée: `manifest.webmanifest`, `service-worker.js`, icônes 180/192/512, et métadonnées dans `index.html`.
- Les 4 aperçus audio locaux sont conservés.
