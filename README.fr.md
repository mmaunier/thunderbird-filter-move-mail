🇬🇧 [English](README.md) | 🇫🇷 Français

# Filtre & Déplacement de Messages — Thunderbird Extension

Extension Thunderbird 128+ pour filtrer et déplacer automatiquement les messages selon des règles personnalisées.

![Thunderbird](https://img.shields.io/badge/Thunderbird-128%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-1.0.3-orange)

## Fonctionnalités

### Filtrage intelligent
- **Filtrage par champs email** : De, Pour, Cc, Bcc (contient, est, ne contient pas, n'est pas)
- **Filtrage par carnet d'adresses** : vérifie si l'expéditeur est dans un carnet d'adresses Thunderbird
- **Filtrage par sujet et corps** du message
- **Smart Filter** : syntaxe avancée type Gmail (`FROM contains john@mail.com AND SUBJECT contains facture`)
- **Conditions multiples** : mode ET (toutes les conditions) ou OU (au moins une condition)
- **Support des accolades** pour les valeurs contenant des espaces : `SUBJECT contains {ma valeur}`

### Exécution optimisée
- **"Lancer tous les filtres"** : scanne uniquement les **INBOX** des comptes sélectionnés (pas les sous-dossiers)
- **"Lancer les filtres sur ce dossier"** : exécute sur le(s) dossier(s) sélectionné(s) dans Thunderbird (multi-sélection supportée)
- **Premier filtre gagnant** : chaque message est traité par le premier filtre correspondant (ordre de priorité)
- **Déplacements groupés** : un seul appel API par destination pour de meilleures performances
- **Protection anti-boucle** : jamais de déplacement vers le dossier source

### Sélection de comptes par filtre
- Chaque filtre possède sa propre sélection de comptes (tous ou individuels)
- Permet de cibler précisément les boîtes de réception à scanner

### Page d'administration (2 onglets)

#### Onglet "Appliquer filtres"
- Exécution automatique à la réception de nouveaux messages
- Exécution manuelle
- Exécution après vérification des indésirables
- Option de suppression de ses propres adresses email

#### Onglet "Gestion des filtres"
- **Barre d'outils** : Nouveau / Supprimer / Cloner / Modifier / Sauvegarder / Restaurer
- **Tableau des filtres** adaptatif (occupe toute la hauteur disponible) avec 4 colonnes :
  - Filtre (nom)
  - Smart Filter (syntaxe condensée)
  - Destination (répertoire cible)
  - Actif (case à cocher)
- Réorganisation par glissement : ⤒ Haut / ↑ Monter / ↓ Descendre / ⤓ Bas
- Exécution ciblée : tous les filtres ou filtre sélectionné

### Éditeur de filtres (fenêtre modale)
- Nom du filtre
- Options d'application (nouveau message, manuel, après indésirables)
- Sélection des comptes ciblés par le filtre
- Mode de correspondance : AU MOINS UNE condition / TOUTES les conditions
- Conditions dynamiques avec boutons +/- (champ, opérateur, valeur)
- Arbre de dossiers navigable avec recherche pour choisir la destination
- Aperçu Smart Filter en temps réel
- Textarea Smart Filter éditable avec synchronisation bidirectionnelle

### Popup barre d'outils
- **Lancer tous les filtres** — scanne les INBOX des comptes configurés
- **Lancer les filtres sur ce dossier** — exécute sur le(s) dossier(s) sélectionné(s)
- **Gestion des filtres** — ouvre la page d'administration

### Logs
- Résumé concis par dossier avec détail par filtre et par message (auteur + sujet)
- Pas de log verbeux en fonctionnement normal

## Structure du projet

```
thunderbird-filter-move-mail/
├── addon/                          # Extension Thunderbird
│   ├── manifest.json               # Manifest V2 (TB 128+)
│   ├── _locales/
│   │   ├── ar/messages.json        # Arabe
│   │   ├── de/messages.json        # Allemand
│   │   ├── en/messages.json        # Anglais
│   │   ├── es/messages.json        # Espagnol
│   │   ├── fr/messages.json        # Français (par défaut)
│   │   ├── it/messages.json        # Italien
│   │   ├── ja/messages.json        # Japonais
│   │   ├── nl/messages.json        # Néerlandais
│   │   └── zh_CN/messages.json     # Chinois (simplifié)
│   ├── background/
│   │   ├── background.html         # Page background
│   │   └── background.js           # Script principal (événements, communication)
│   ├── popup/
│   │   ├── popup.html              # Popup du bouton toolbar
│   │   ├── popup.css
│   │   └── popup.js
│   ├── options/
│   │   ├── options.html            # Page d'administration (2 onglets)
│   │   ├── options.css
│   │   └── options.js
│   ├── filter-editor/
│   │   ├── editor.html             # Modal éditeur de filtre
│   │   ├── editor.css
│   │   └── editor.js
│   ├── lib/
│   │   ├── storage.js              # Persistance (browser.storage.local)
│   │   ├── filter-engine.js        # Moteur de filtrage (matching + exécution)
│   │   └── account-manager.js      # Gestion comptes/dossiers
│   └── icons/
│       ├── filter-16.svg
│       ├── filter-32.svg
│       ├── filter-48.svg
│       └── filter-128.svg
├── releases/                       # Fichiers .xpi (releases)
├── updates.json                    # Mises à jour auto pour Thunderbird
├── LICENSE                         # MIT
├── README.md                       # Documentation anglaise
└── README.fr.md                    # Documentation française
```

## Installation

### Depuis le fichier .xpi (recommandé)
1. Télécharger le fichier `.xpi` depuis les [Releases](https://github.com/mmaunier/thunderbird-filter-move-mail/releases)
2. Ouvrir Thunderbird → Menu → Outils → Modules complémentaires
3. ⚙️ → Installer un module depuis un fichier → Sélectionner le `.xpi`

### En mode développement
1. Ouvrir Thunderbird
2. Menu → Outils → Modules complémentaires
3. ⚙️ → Debug Add-ons → Charger un module temporaire
4. Sélectionner le fichier `addon/manifest.json`

## Syntaxe Smart Filter

```
FROM contains john@example.com AND SUBJECT contains facture
TO is admin@company.com OR CC contains team
FROM in_addressbook
BODY contains {mot-clé important avec espaces}
```

| Champs | `FROM`, `TO`, `CC`, `BCC`, `SUBJECT`, `BODY` |
|--------|----------------------------------------------|
| **Opérateurs** | `contains`, `not_contains`, `is`, `is_not`, `in_addressbook`, `not_in_addressbook` |
| **Connecteurs** | `AND` (toutes les conditions), `OR` (au moins une) |
| **Accolades** | `{valeur avec espaces}` pour les valeurs multi-mots |

## APIs Thunderbird utilisées

| API | Usage |
|-----|-------|
| `accounts` | Lister les comptes et identités |
| `addressBooks` | Vérifier les contacts dans les carnets d'adresses |
| `contacts` | Recherche rapide de contacts |
| `messages` | Lister, lire et déplacer les messages |
| `mailTabs` | Obtenir le(s) dossier(s) sélectionné(s) (multi-sélection TB 128+) |
| `storage` | Stocker filtres et préférences |
| `i18n` | Internationalisation (9 langues) |

## Permissions

| Permission | Usage |
|-----------|-------|
| `accountsRead` | Lecture des comptes et dossiers |
| `addressBooks` | Accès aux carnets d'adresses |
| `messagesRead` | Lecture des messages |
| `messagesMove` | Déplacement des messages |
| `messagesDelete` | Suppression des messages |
| `storage` | Stockage local des filtres et préférences |

## Langues

- 🇫🇷 Français (par défaut)
- 🇬🇧 Anglais
- 🇩🇪 Allemand
- 🇪🇸 Espagnol
- 🇮🇹 Italien
- 🇳🇱 Néerlandais
- 🇯🇵 Japonais
- 🇨🇳 Chinois (simplifié)
- 🇸🇦 Arabe

## Compatibilité

- Thunderbird 128+ (Manifest V2)
- Testé avec Thunderbird 147

## Licence

[MIT](LICENSE)

## Auteur

Mikael Maunier — [@mmaunier](https://github.com/mmaunier)
