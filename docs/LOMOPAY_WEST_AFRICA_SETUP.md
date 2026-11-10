# IA SONO — préparation LomoPay Direct API (Mobile Money)

## Architecture confirmée

- Frontend : `izisono-server/public/script.js` (servi par Express).
- API : Express, route de paiement `/api/billing`.
- Création d'une demande Mobile Money : `POST https://lomopay.net/api/v1/direct.php`.
- Référence interne : `izo_<UUID>`, enregistrée dans `public.payment_transactions`.
- Confirmation : webhook signé LomoPay, puis vérification serveur-à-serveur auprès de LomoPay avant crédit.
- Crédit : RPC Supabase `apply_paydunya_payment` avec `p_gateway='lomopay'`. Le nom historique de la fonction est conservé pour éviter une migration risquée ; son paramètre `p_gateway` identifie réellement LomoPay.

## URL du webhook à enregistrer dans LomoPay

```
https://VOTRE-DOMAINE-PUBLIC/api/billing/lomopay-webhook
```

L'URL doit être publique et en HTTPS en production. Le serveur transmet automatiquement cette URL dans le champ `webhook_url` à chaque appel Direct API.

Événement de paiement attendu : `payment.succeeded`, `payment.updated`, `payment.failed`.

Le serveur :
1. lit le corps HTTP brut ;
2. vérifie `X-LomoPay-Signature` avec HMAC-SHA256 et la clé secrète ;
3. retrouve la transaction grâce à `data.external_reference` ;
4. interroge LomoPay à nouveau pour confirmer le statut, le montant et la devise ;
5. appelle la RPC Supabase idempotente uniquement si le paiement est réellement `completed`.

Ne pas retirer le middleware `express.raw()` avant `express.json()` pour la route webhook : la signature dépend des octets exacts du corps reçu.

## Variables Render

Configurer dans le service web Render :

- `PUBLIC_APP_URL` : URL HTTPS publique du service.
- `CLIENT_URL` : même origine publique (ou liste d'origines autorisées séparées par des virgules).
- `SUPABASE_URL` : URL du projet Supabase Winner / `izisono`.
- `SUPABASE_PUBLISHABLE_KEY` : clé publique Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` : clé secrète uniquement côté serveur.
- `LOMOPAY_PUBLIC_KEY` : clé publique LomoPay.
- `LOMOPAY_SECRET_KEY` : clé secrète LomoPay.
- `LOMOPAY_ENABLED_CURRENCIES=XOF` : rester sur XOF pour le lancement Togo.
- `LOMOPAY_COUNTRY_OPERATORS_JSON` : codes d'opérateur exacts communiqués par LomoPay.

Les clés secrètes ne doivent jamais être ajoutées au frontend, au dépôt GitHub ou à une capture d'écran.

## Attention aux prérequis LomoPay

L'endpoint `/direct.php` est réservé aux comptes/plans LomoPay qui ont l'accès Direct API. LomoPay peut répondre `plan_required` si cette option n'est pas activée.

Les codes opérateur ne doivent pas être devinés. Demander à LomoPay les codes exacts pour Togo (T-Money / Togocel et Moov Money) et confirmer que la collecte Direct API en XOF est activée sur le compte.

Le code propose plusieurs pays, mais seuls les pays dont la devise et les opérateurs sont confirmés doivent être activés. Pour le premier test au Togo, garder uniquement XOF.

## Séquence de test sans risque

1. Configurer les clés `pk_test_` et `sk_test_` ensemble (ne jamais mélanger test et live).
2. Configurer les codes opérateur de test fournis par LomoPay.
3. Déployer la branche de préparation après validation.
4. Créer un compte utilisateur de test et utiliser un forfait à petit montant.
5. Vérifier le statut dans le tableau de bord LomoPay, le webhook Render et `payment_transactions`.
6. Vérifier que le solde de crédits augmente une seule fois, même si LomoPay renvoie le webhook plusieurs fois.
7. Passer en production uniquement après réussite des tests et remplacement des deux clés par les clés live correspondantes.

## Dépannage

- `public_app_url_missing` / `public_app_url_must_be_public_https` : corriger `PUBLIC_APP_URL`.
- `lomopay_credentials_missing` : renseigner les deux clés.
- `lomopay_credentials_invalid` : vérifier qu'elles sont toutes deux test ou toutes deux live.
- `lomopay_operator_not_configured` : ajouter les codes opérateur réels.
- `plan_required` : demander l'activation de Direct API dans le compte LomoPay.
- `invalid_signature` : vérifier la clé secrète et conserver le corps brut HTTP.
- `payment_reference_unknown` / `payment_reference_mismatch` : vérifier la référence renvoyée par LomoPay.

Documentation officielle : https://www.lomopay.net/en/docs-api
