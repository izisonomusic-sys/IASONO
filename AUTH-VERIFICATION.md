# Correction — interface d’authentification unique — 26 septembre 2026

## Ce qui a changé

Suite à la demande « un seul formulaire visible à la fois », la connexion et l’inscription ne sont plus deux conteneurs séparés : il existe désormais **une seule carte** `#authModal` contenant trois panneaux (`login`, `signup`, `recovery`) dont **un seul est visible** à chaque instant. Le passage « Créer un compte » ⇄ « Se connecter » se fait dans la même carte, à la même position, sans fermeture/réouverture visible. La récupération de mot de passe partage la même carte.

Fichiers modifiés pour cette correction : `izisono-server/public/index.html`, `script.js`, `styles.css` et les trois mêmes dans `izisono-frontend/`, plus `tests/auth-pwa.cjs` et ce rapport. **Service worker, manifest, backend, routes et fonctions métier inchangés.**

## Conservation du login existant

- Le bouton **Continuer** et son handler Supabase (`signInWithPassword` / `signInWithOtp`) sont conservés.
- La case « Connexion par mot de passe » est cochée par défaut : e-mail + mot de passe visibles d’emblée ; décochée, elle retrouve l’envoi de lien par e-mail. Le champ mot de passe de connexion a reçu le même bouton Afficher/Masquer.
- « Mot de passe oublié ? » ouvre le panneau de récupération dans la même carte.
- `/auth` ouvre directement la carte en mode création (l’accueil et ses boutons existants restent inchangés).

## Bogue réel trouvé et corrigé pendant les tests

En mode inscription, quitter le champ e-mail vide affichait l’erreur sous le champ, ce qui **déplaçait le bouton au moment du clic** (le clic pouvait tomber à côté). Correctif applicatif : les messages d’erreur réservent désormais leur hauteur (`min-height`), l’interface ne saute plus pendant la saisie ni pendant un clic.

## Tests 1 à 8 demandés

| Test | Résultat |
| --- | --- |
| 1 — Ouverture : uniquement le formulaire « Créer un compte » (schéma demandé) | Réussi (desktop + mobile, et `/auth`) ; « Se connecter » en bas affiche le formulaire de connexion |
| 2 — Clic « Se connecter » en bas : l’inscription disparaît, la connexion apparaît au même endroit | Réussi ; position de la carte identique au pixel près, 3 allers-retours × 3 largeurs |
| 3 — Clic « Créer un compte » en bas : retour au schéma | Réussi, même ancrage |
| 4 — Créer un compte | Réussi avec le vrai SDK Supabase et réponses distantes simulées (confirmation + session immédiate) ; création réelle sur votre projet Supabase à valider côté serveur |
| 5 — Se connecter avec le compte créé | Réussi (e-mail + mot de passe envoyés au vrai SDK, session restaurée) |
| 6 — Actualiser, session conservée | Réussi (reload + nouvel onglet) |
| 7 — Mobile | Réussi : 320/390/768/1280 px, un seul formulaire, aucun débordement horizontal ; captures contrôlées |
| 8 — PWA | Réussi avec service worker actif : contrôle du worker, installabilité Chromium sans erreur, shell hors ligne ; un moniteur vérifie qu’aucun instant n’affiche deux formulaires simultanément |

Suites exécutées : frontend principal, repli (`TEST_LEGACY=1`) et worker actif (`TEST_PWA=1`) — trois fois PASS, plus `npm test --prefix izisono-server`, `node --check` des scripts et `git diff --check`.

Les tests 4/5 utilisent des réponses distantes simulées : l’e-mail réel et la création distante restent à vérifier avec la configuration Supabase (voir section « Configuration » ci-dessous).

---

# Refonte ciblée de l’inscription — 26 septembre 2026

## Périmètre et analyse préalable

Le projet existant a été conservé. Aucun nouveau projet n’a été créé.

Le serveur Express, le frontend natif servi depuis `izisono-server/public`, son repli `izisono-frontend`, le client Supabase initialisé dans `script.js` et les routes métier restent en place. Il n’existe pas de `supabase-client.js` séparé. L’inscription utilise toujours `state.supabase.auth.signUp`, la connexion existante conserve `signInWithPassword`/`signInWithOtp`, et la persistance reste celle du SDK.

La page de référence `https://app.izimelo.com/fr/auth/login` a été consultée via extraction de son contenu : identité, accueil court, invitation à créer, action d’authentification et liens juridiques. L’inspection de cette référence n’est pas une validation visuelle exhaustive de son interface interactive. Aucun code, logo ou texte de marque Izimelo n’a été copié. IZISONO conserve ses couleurs, son logo et son studio. Aucune intégration Google OAuth n’a été trouvée ni ajoutée.

La nouvelle inscription est une vue plein écran dans le dialogue existant, pas une nouvelle application, un nouveau dashboard ou une nouvelle architecture de routage.

## Liste exacte des fichiers modifiés pour cette refonte

| Fichier | Modification |
| --- | --- |
| `izisono-server/public/index.html` | Carte d’inscription, labels/erreurs liés aux champs, afficher/masquer, case de consentement et liens juridiques, panneau de confirmation, renvoi et accès au studio ; lien de récupération à côté du login existant, formulaires demande/nouveau mot de passe |
| `izisono-frontend/index.html` | Mêmes ajouts dans le repli existant |
| `izisono-server/public/script.js` | Validation en temps réel, messages non techniques, états/envoi unique, confirmation/renvoi avec temporisation, focus clavier, récupération Supabase et gestion du retour PASSWORD_RECOVERY |
| `izisono-frontend/script.js` | Mêmes changements ciblés sans normalisation globale des anciennes différences d’encodage |
| `izisono-server/public/styles.css` | Styles limités à la carte d’authentification, responsive et focus visible ; pas de refonte du studio |
| `izisono-frontend/styles.css` | Mêmes styles ciblés |
| `izisono-server/public/legal.html` | Sections `#conditions` et `#confidentialite` ; conditions succinctes et contenu de confidentialité existant conservé |
| `izisono-frontend/legal.html` | Mêmes sections |
| `tests/auth-pwa.cjs` | Tests étendus : Gmail simulé, validations, consentement, renvoi, récupération, accès clavier, responsive, Auth sous service worker |
| `AUTH-VERIFICATION.md` | Rapport actualisé, limites et configuration |

**Le manifest, les icônes et le service worker n’ont pas été modifiés durant cette refonte.** Le worker apparaît déjà modifié dans le diff cumulé de la session à cause de la correction précédente, détaillée dans l’historique plus bas. Sa version de cache n’a pas changé.

## Fonctionnalités ajoutées / améliorées

- Carte centrée IZISONO et entrée mobile, sans nouveau formulaire de connexion.
- E-mail, mot de passe, confirmation, consentement obligatoire et erreurs sous les champs (`aria-describedby`, `aria-invalid`, annonces de statut).
- Validation à la saisie/perte de focus et au submit. Minimum local de **8 caractères pour inscription/récupération** ; les politiques plus strictes du projet Supabase sont appliquées côté fournisseur. La longueur minimale réelle configurée dans le tableau de bord n’est pas consultable ici et n’a pas été modifiée. Les règles du login existant sont inchangées.
- Boutons Afficher/Masquer avec retour automatique au masquage après 10 secondes ou perte de focus. Par défaut, les champs restent `password`.
- États « Créer mon compte », « Création du compte… », « Compte créé ✓ » ; blocage des doubles soumissions.
- Confirmation distincte selon présence d’une session : accès au studio existant si connecté, sinon instruction de vérification d’e-mail, adresse saisie et retour à la connexion. Le texte prévoit le cas d’une adresse déjà inscrite, sans prétendre avoir connecté l’utilisateur.
- Renvoi via `auth.resend({type:'signup', ...})`, délai de 60 secondes, messages prudents évitant de confirmer l’existence d’un compte.
- Mot de passe oublié via `auth.resetPasswordForEmail`, puis `auth.updateUser({password})` après retour authentifié. Écran adapté aux liens invalides/expirés. Aucun système de récupération parallèle.
- Liens juridiques réels, focus retenu dans le dialogue, Échap/fermeture et retour au déclencheur ; cible des boutons principaux de 50 px et formulaire défilable.
- Aucun indicateur de force artificiel : les contraintes locales sont explicites et les refus de Supabase sont traduits en messages compréhensibles.

## Tests A à O — exécutés dans Chromium

**Important :** pour Auth, le véritable SDK Supabase 2.117.2 est exécuté dans le navigateur, mais les réponses du service distant et des données privées sont simulées. Le serveur Express, les fichiers de l’app, les routes publiques et les contrôles PWA sont réels. Aucune boîte Gmail, inscription distante ou transaction de production n’a été créée.

| Test | Résultat et portée |
| --- | --- |
| A — Ouverture inscription | Réussi : desktop, mobile, retour au login, focus clavier cyclique |
| B — Adresse Gmail valide | Réussi en simulation : e-mail `@gmail.com`, mot de passe et redirect envoyés par le SDK à signup ; pas de création Gmail réelle |
| C — Confirmation différente | Réussi : message sous le champ et aucun envoi |
| D — E-mail invalide | Réussi : message sous le champ et aucun envoi |
| E — Mot de passe vide | Réussi ; mot de passe trop court et conditions non acceptées également bloqués |
| F — Création réussie | Réussi avec réponses simulées : confirmation requise et session immédiate, chargement/désactivation, double submit bloqué, mot de passe effacé ; erreur 422 traduite et renvoi après 60 s testés |
| G — Connexion | Réussi avec SDK réel/réponse simulée ; e-mail et mot de passe envoyés par le formulaire existant vérifiés |
| H — Actualisation | Réussi : session SDK restaurée, profil/crédits affichés et token transmis ; nouvel onglet testé aussi. Fermeture/réouverture complète d’un navigateur utilisateur non testée |
| I — Déconnexion/reconnexion | Réussi en simulation ; connexion OTP préservée et testée également |
| J — Mot de passe oublié | Réussi en simulation : demande, temporisation, retour via hash recovery, nouveau mot de passe/confirmation, updateUser, lien expiré. Réception/clic réel d’un e-mail non testé |
| K — Mobile | Réussi : largeurs 320, 390, 768 et 1280 px sans débordement horizontal du dialogue ; contrôle visuel captures 390/1280 ; clavier logiciel sur téléphone physique non testé |
| L — Installation PWA | Manifest/nom/start_url/display vérifiés, icônes 192/512 servies aux bonnes dimensions, `Page.getInstallabilityErrors` sans erreur ; installation manuelle sur appareil non effectuée |
| M — Ouverture depuis PWA | Parcours Auth complet réussi sous contrôle du service worker (`TEST_PWA=1`) et shell hors ligne vérifié ; lancement d’une application réellement installée en mode standalone non réalisé |
| N — Console | Aucune exception JS ni erreur console inattendue dans le parcours Auth ; la 422 volontaire est attendue. Sans configuration Supabase et hors ligne, des messages réseau/configuration restent attendus |
| O — Non-régression | Login, OTP, notifications, affichage profil/crédits simulés, routes publiques HTTP 200 et protection HTTP 401 profil/chansons/admin réussis. Syntaxe backend/frontend/worker et `git diff --check` réussis. Génération Mureka et transaction PayDunya réelles non exécutées |

Les tests ont été exécutés pour le frontend principal, le repli (`TEST_LEGACY=1`) et le frontend principal avec worker actif (`TEST_PWA=1`). Les captures de contrôle ne font pas partie du code de production.

## Conservation des fonctionnalités

- **Login / Supabase / sessions** : même client, même stockage SDK, même handler de connexion et bouton Continuer ; tests d’intégration réussis dans la portée ci-dessus.
- **Génération / crédits / paiement** : aucune modification du backend, des routes, des migrations, des fonctions de génération ou de paiement. Pas de garantie de bout en bout en production sans leurs configurations et un compte réel.
- **PWA** : worker, manifest, icônes, cache et enregistrement inchangés pour cette refonte ; contrôles techniques réussis.

## Configuration et limites restantes

1. Aucune variable supplémentaire. Conserver `SUPABASE_URL=https://cezxykekfgoflwszzkwb.supabase.co`, `SUPABASE_PUBLISHABLE_KEY`, et `SUPABASE_SERVICE_ROLE_KEY` exclusivement côté serveur, plus les variables métier existantes. Seule l’URL a été communiquée ; aucun secret n’a été demandé ou ajouté.
2. Supabase Auth doit autoriser les inscriptions e-mail, configurer la confirmation/SMTP et accepter les redirections du site. Ajouter pour le développement **`http://localhost:3000`** et **`http://localhost:3000/?auth=recovery`**, puis leurs équivalents HTTPS de production, sans supprimer les URL déjà utilisées. Conserver Site URL cohérent avec la production.
3. Sans clé publique configurée dans le serveur, le message « Supabase non configuré » est normal et les requêtes réelles d’inscription ne peuvent pas aboutir. L’aperçu sert à vérifier l’interface, pas à valider la production.
4. Les conditions juridiques ajoutées sont une base succincte à faire valider/compléter par l’éditeur (identité légale, droits applicables, obligations de confidentialité, etc.). La case impose l’accord dans l’interface ; aucun registre serveur de consentement/version juridique n’a été ajouté.
5. À compléter avec un compte de test autorisé : vrai mail de confirmation/renvoi/récupération, politique de sécurité Supabase réelle, token expiré, retour après fermeture complète du navigateur, installation/lancement sur téléphone, génération et paiement en environnement adapté.
6. Aucun secret Supabase exposé, aucun mot de passe journalisé ou persisté dans une table/un stockage personnalisé. Le bouton Afficher ne révèle le mot de passe que sur demande temporaire. Les mots de passe de test sont générés aléatoirement en mémoire.

## Rejouer

Les commandes d’installation isolée des dépendances sont dans l’historique ci-dessous. Serveur démarré avec `npm start --prefix izisono-server` :

```sh
NODE_PATH=$PWD/node_modules/test-tools/node_modules node tests/auth-pwa.cjs
TEST_LEGACY=1 NODE_PATH=$PWD/node_modules/test-tools/node_modules node tests/auth-pwa.cjs
TEST_PWA=1 NODE_PATH=$PWD/node_modules/test-tools/node_modules node tests/auth-pwa.cjs
npm test --prefix izisono-server
```

Dans ce sandbox, ajouter `LD_LIBRARY_PATH=$PWD/node_modules/chromium-libs/lib` comme décrit plus bas. Le code de production n’a reçu aucune dépendance de test.

---

# Historique — correction précédente (avant la refonte)

Le rapport ci-dessous décrit la première correction d’inscription. En cas de différence (ancien minimum 6 caractères, interface ou matrice de tests), le rapport de refonte ci-dessus fait foi.

# Inscription et connexion — vérification du 25 septembre 2026

## Architecture examinée et conservée

- Backend Node/Express : `izisono-server/server.js`, modules `routes/music.js`, `billing.js`, `lyrics.js`, `language.js`, `admin.js`, accès Supabase REST dans `supabase.js`.
- Frontend HTML/CSS/JS natif : `izisono-server/public` est servi en priorité ; `izisono-frontend` est le repli existant. Les deux copies ont reçu les mêmes changements ciblés, sans les fusionner ni écraser leurs différences.
- Auth existante : un seul client `@supabase/supabase-js@2`, configuration publique `/api/config`, connexion `signInWithPassword`, lien e-mail `signInWithOtp`, déconnexion `signOut`, restauration `getUser`, session `getSession`, listener `onAuthStateChange`. Aucun parcours `signUp` existant trouvé. Persistance/rafraîchissement automatique restent gérés par les paramètres par défaut du SDK, sans nouveau stockage de session.
- Compte : `/api/me` (GET/PATCH), profil, crédits ; chansons : `/api/tracks`, `/api/generate`, `/api/generation/:trackId` ; paiement : `/api/billing/plans`, `/methods`, `/checkout`, `/verify/:paymentId`, `/paydunya-ipn` ; autres routes : paroles, langues, administration. Aucun changement des routes ni des règles métier.
- SQL existant dans `supabase/migrations` : profils liés à `auth.users`, triggers, RLS, crédits, paiements et génération. Aucune migration ajoutée/modifiée.
- PWA dans `izisono-server/public` uniquement : manifest, service worker, icônes 192/512 et Apple. Le frontend de repli n'avait pas de PWA autonome ; aucune seconde PWA créée.
- Configuration : `.env.example` existant ; aucun `.env` ni variable Supabase/Mureka/PayDunya disponible pendant ces tests.

## Fichiers changés et justification

1. `izisono-server/public/index.html`
2. `izisono-frontend/index.html`
   - Boutons « Créer un compte » (en-tête desktop, entrée mobile et dialogue de connexion), formulaire e-mail/mot de passe/confirmation, labels, messages persistants et lien vers la connexion existante.
   - `type="submit"` explicite sur le bouton de connexion « Continuer » : sans cet attribut, `hardenButtons()` le transformait en simple bouton. Son texte, son handler et les deux méthodes de connexion sont conservés.
3. `izisono-server/public/script.js`
4. `izisono-frontend/script.js`
   - Inscription via `state.supabase.auth.signUp`, validation HTML e-mail/minimum 6 caractères, confirmation identique, blocage des doubles soumissions, erreurs Supabase, message de confirmation e-mail. La politique Supabase plus stricte reste prioritaire côté serveur. Aucun mot de passe stocké ; les champs sont effacés au succès/à la fermeture.
   - Boutons d'inscription masqués une fois connecté. Passage vers le formulaire de connexion existant avec option mot de passe cochée.
   - Chargement des données différé hors du callback Auth pour éviter un appel `getSession` sous le verrou du SDK.
   - Échec réseau de `loadOccasions` géré : le test hors ligne révélait une promesse rejetée non gérée.
5. `izisono-server/public/styles.css`
6. `izisono-frontend/styles.css`
   - Quelques règles limitées à l'inscription : entrée mobile, masquage connecté, formulaire défilable sur petit écran et état d'attente. Couleurs/design existants réutilisés.
7. `izisono-server/public/service-worker.js`
   - Avant : cache-first pour tous les GET de même origine, y compris réponses privées et paiements, et ancien HTML/JS conservé indéfiniment.
   - Après : cache limité au shell public existant, network-first avec repli hors ligne ; API, requêtes avec paramètres et Authorization exclues. Nettoyage ciblé des anciennes entrées hors shell lors de l'activation.
   - Nom `izisono-v18-shell` conservé, aucune réinitialisation globale des caches, aucun changement du manifest, des icônes ou de l'enregistrement du worker.
8. `tests/auth-pwa.cjs` : tests navigateur et HTTP reproductibles.
9. `AUTH-VERIFICATION.md` : ce rapport et les limites de validation.

## Résultats exécutés

Les tests d'auth sont des tests navigateur Chromium avec le **véritable SDK Supabase 2.117.2**, mais **réponses du service Supabase simulées**. Cela vérifie l'intégration, pas la création d'un compte sur le projet distant. Les deux copies du frontend ont été testées.

| Contrôle | Résultat |
| --- | --- |
| Accueil, chargement des occasions et bouton desktop/mobile | Réussi dans Chromium, serveur Express réel |
| E-mail invalide / mot de passe trop court | Envoi bloqué |
| Mots de passe différents | Message explicite ; aucun appel signup |
| Inscription | Appel signup contenant e-mail/mot de passe et redirection vérifié ; cas confirmation e-mail et session immédiate réussis avec réponses simulées |
| Erreur de sécurité Supabase | Affichage vérifié avec réponse 422 simulée |
| Déconnexion puis reconnexion e-mail/mot de passe | Réussi avec SDK réel et réponses simulées |
| Actualisation / retour dans un nouvel onglet | Session SDK restaurée, profil et crédits affichés, token transmis à `/api/me` |
| Connexion par lien e-mail existante | Appel OTP et fermeture du dialogue vérifiés, réponse simulée |
| Notifications | Ouverture/fermeture vérifiées |
| Console auth | Aucune exception JS ou erreur console inattendue ; la 422 volontaire est exclue |
| Manifest | Nom présent, `start_url: /`, `display: standalone`, icônes HTTP 200 et dimensions PNG 192/512 exactes |
| Installation PWA | `Page.getInstallabilityErrors` Chromium : aucune erreur ; installation manuelle sur téléphone non réalisée |
| Service worker | Installé, activé et contrôlant la page ; shell mis en cache ; aucune réponse `/api/` mise en cache |
| Hors ligne | Shell d'accueil chargé après rechargement, sans exception JS non gérée ; auth et API restent indisponibles hors ligne |
| API publiques réelles | 200 : health, config, occasions, styles, offres, moyens de paiement, langues |
| Protection API réelle | 401 sans session : profil, chansons, administration |
| Syntaxe | `npm test` backend, `node --check` des deux scripts frontend et du worker réussis |
| Patch | `git diff --check` réussi |

## Limites et erreurs restantes

- **Aucun compte distant n'a été créé.** Réception/clic du mail, configuration SMTP, politique réelle des mots de passe, renouvellement d'un token expiré et restauration d'un compte réel restent à vérifier sur l'environnement Supabase configuré.
- Dans l'aperçu sans variables, le message « Supabase non configuré » est attendu. Le shell reste navigable ; une inscription réelle ne peut pas aboutir.
- Le PWA affiche son interface hors ligne, pas des données utilisateur/paiements périmés. Des messages réseau gérés restent attendus pour les services indisponibles hors ligne.
- Mureka, paiement PayDunya réel, attribution réelle de crédits, sauvegarde de profil, bibliothèque avec chansons et administration complète n'ont pas été testés de bout en bout, faute de configuration et de compte. Leurs implémentations n'ont pas été modifiées. Ces tests ne constituent pas une garantie absolue d'absence de régression de toutes les fonctionnalités.
- Les anciennes différences d'encodage du script de repli ne sont pas corrigées globalement, pour ne pas réécrire le fichier hors périmètre.
- Au premier retour après déploiement, un ancien worker peut servir une ancienne page avant de se mettre à jour ; rouvrir/actualiser une fois après son activation. Pas de suppression manuelle du stockage ou des sessions nécessaire.

## Configuration nécessaire (déjà prévue, aucune nouvelle variable)

- `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` : navigateur via `/api/config`.
- `SUPABASE_SERVICE_ROLE_KEY` : **backend uniquement**, nécessaire aux fonctionnalités serveur existantes ; ne jamais la mettre dans la variable publique.
- `CLIENT_URL` et `PUBLIC_APP_URL` : URL réelle HTTPS du site (et origine d'aperçu si nécessaire). `PORT` pour le serveur.
- Conserver les variables Mureka/PayDunya existantes pour leurs fonctionnalités.
- Dans Supabase Auth : fournisseur e-mail et inscriptions activés, Site URL/Redirect URLs autorisant l'origine du site, confirmation e-mail et SMTP configurés selon la politique voulue. Les migrations existantes doivent être appliquées.
- Aucun secret ou mot de passe de compte n'est ajouté au dépôt. Les tests génèrent un mot de passe aléatoire en mémoire.

## Rejouer les tests

Depuis la racine (dépendances de test isolées et ignorées par Git, aucun changement du package de production) :

```sh
npm ci --prefix izisono-server
npm install --no-save --prefix node_modules/test-tools playwright@1.63.0 @sparticuz/chromium@153.0.0 @supabase/supabase-js@2.117.2
# Terminal séparé :
npm start --prefix izisono-server
# Tests :
NODE_PATH=$PWD/node_modules/test-tools/node_modules node tests/auth-pwa.cjs
TEST_LEGACY=1 NODE_PATH=$PWD/node_modules/test-tools/node_modules node tests/auth-pwa.cjs
npm test --prefix izisono-server
```

Chromium demande des bibliothèques système NSS/NSPR. Dans le sandbox, faute d'accès aux dépôts Debian, celles fournies par le paquet Chromium ont été extraites localement :

```sh
mkdir -p node_modules/chromium-libs
node -e "const fs=require('fs'),z=require('zlib');fs.writeFileSync('node_modules/chromium-libs/libs.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/test-tools/node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
tar xf node_modules/chromium-libs/libs.tar -C node_modules/chromium-libs
LD_LIBRARY_PATH=$PWD/node_modules/chromium-libs/lib NODE_PATH=$PWD/node_modules/test-tools/node_modules node tests/auth-pwa.cjs
```

Projet existant conservé : aucune recréation, aucun template ajouté, aucune nouvelle architecture ni authentification parallèle.
