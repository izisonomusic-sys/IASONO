# IZISONO V17 — navigation + hero + studio IA + FCFA

## Corrections appliquées
- Navigation interne SPA durcie : les clics Profil, Notes, Paiement, Bibliothèque, Explorer et Créer ne déclenchent plus de navigation native vers la page d'accueil.
- Correction de la cause structurelle : suppression du double `id="top"` (il existait sur `main` et sur le hero), qui pouvait faire résoudre les ancres vers le mauvais élément.
- Les boutons sans `type` sont automatiquement convertis en `type="button"` pour empêcher les soumissions accidentelles de formulaires.
- Les changements d'URL internes utilisent `history.replaceState()` au lieu d'un saut natif du navigateur.
- Retour Profil / Notes / Paiement propre, sans perte de position.
- Hero conservé avec son titre et sa description, mais enrichi avec animations du vinyle, anneaux, égaliseur, ondes et notes flottantes, avec respect de `prefers-reduced-motion`.
- Nouvelle section **Studio IA** inspirée des workflows modernes de générateurs de musique : texte→chanson, paroles→chanson, voix/styles, variantes/édition, exploration et export.
- Assistant de paroles connecté à l'endpoint existant `/api/lyrics/generate`.
- Prix FCFA/XOF : le pack 4 Notes est désormais **1 900 FCFA**. La conversion ZAR n'est plus utilisée.
- Le serveur charge maintenant aussi `izisono-server/.env` explicitement.
- Un `.env` et un `.env.example` sont fournis avec des valeurs vides à renseigner ; aucune clé secrète n'est incluse.

## Référence produit
La structure de la nouvelle section Studio IA s'inspire des fonctionnalités publiquement présentées par des générateurs modernes (texte/lyrics→song, voix, extension, cover, layering, séparation audio), sans copier leur identité visuelle ni leur contenu propriétaire.
