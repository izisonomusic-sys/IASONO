# LomoPay — configuration Afrique de l’Ouest

Cette branche ajoute la sélection du pays, les prix convertis depuis les tarifs de référence XOF, les méthodes Mobile Money configurées par pays, le champ OTP et la gestion des redirections LomoPay.

## Variables Render

Conserver les variables Supabase déjà présentes. Vérifier notamment :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_APP_URL` (URL publique du site, par exemple `https://iasono.onrender.com`)
- `LOMOPAY_PUBLIC_KEY`
- `LOMOPAY_SECRET_KEY`

Ajouter ensuite :

- `LOMOPAY_ENABLED_CURRENCIES`: laisser `XOF` tant que LomoPay n’a pas confirmé par écrit les autres devises et routes Direct API. Après confirmation seulement, ajouter les codes confirmés, séparés par des virgules, par exemple `XOF,GHS`.
- `LOMOPAY_COUNTRY_OPERATORS_JSON`: JSON qui associe chaque pays aux codes opérateur de collecte exacts communiqués par LomoPay.

Structure attendue (les valeurs de code ci-dessous sont des exemples de remplacement, PAS des codes opérateur réels) :

```json
{
  "TG": [
    { "code": "REMPLACER_PAR_CODE_LOMOPAY_TG", "name": "T-Money", "short": "T-Money", "icon": "📱" },
    { "code": "REMPLACER_PAR_CODE_LOMOPAY_TG", "name": "Moov Money", "short": "Moov Money", "icon": "📲" }
  ],
  "CI": [
    { "code": "REMPLACER_PAR_CODE_LOMOPAY_CI", "name": "Mobile Money", "short": "Mobile Money", "icon": "📱" }
  ],
  "SN": [
    { "code": "REMPLACER_PAR_CODE_LOMOPAY_SN", "name": "Mobile Money", "short": "Mobile Money", "icon": "📱" }
  ]
}
```

Répéter le format pour les pays et opérateurs dont LomoPay a confirmé la collecte. Les anciens paramètres `LOMOPAY_TG_TOGOCEL_OPERATOR` et `LOMOPAY_TG_MOOV_OPERATOR` restent acceptés si le JSON complet n’est pas défini.

## Pays et devises gérés par le code

- XOF : TG, CI, SN, ML, BF, BJ, NE
- GHS : GH
- NGN : NG
- GNF : GN
- SLE : SL
- LRD : LR

Le backend calcule le montant local à partir des prix de référence XOF avec le service de taux de change ExchangeRate-API (cache serveur de 6 heures). En cas d’indisponibilité du taux, le checkout est bloqué plutôt que d’utiliser un taux inventé.

## Conditions avant activation réelle

1. Obtenir de LomoPay les codes opérateur de collecte Direct API exacts pour chaque pays.
2. Faire confirmer que le compte LomoPay autorise Direct API et chaque devise (XOF, GHS, NGN, GNF, SLE, LRD) ainsi que chaque route.
3. Ajouter uniquement les devises confirmées à `LOMOPAY_ENABLED_CURRENCIES`.
4. Ajouter les codes opérateur exacts à `LOMOPAY_COUNTRY_OPERATORS_JSON`.
5. Tester chaque route en environnement de test avant d'activer les paiements réels.

Les pays en devise autre que XOF restent désactivés par défaut. Le code ne prétend pas que LomoPay prend en charge une devise ou un opérateur tant que cela n’a pas été confirmé.
