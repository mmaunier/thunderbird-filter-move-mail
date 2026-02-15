🇬🇧 English | 🇫🇷 [Français](README.fr.md)

# Filter & Move Messages — Thunderbird Extension

Thunderbird 128+ extension to automatically filter and move messages based on custom rules.

![Thunderbird](https://img.shields.io/badge/Thunderbird-128%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-1.0.2-orange)

## Features

### Smart Filtering
- **Email field filtering**: From, To, Cc, Bcc (contains, is, not contains, is not)
- **Address book filtering**: checks if the sender is in a Thunderbird address book
- **Subject and body filtering**
- **Smart Filter**: advanced Gmail-like syntax (`FROM contains john@mail.com AND SUBJECT contains invoice`)
- **Multiple conditions**: AND mode (all conditions) or OR mode (at least one condition)
- **Brace support** for values containing spaces: `SUBJECT contains {my value}`

### Optimized Execution
- **"Run all filters"**: scans only the **INBOX** of selected accounts (not subfolders)
- **"Run filters on this folder"**: runs on the selected folder(s) in Thunderbird (multi-selection supported)
- **First matching filter wins**: each message is processed by the first matching filter (priority order)
- **Batch moves**: a single API call per destination for better performance
- **Anti-loop protection**: never moves to the source folder

### Per-Filter Account Selection
- Each filter has its own account selection (all or individual)
- Precisely target which inboxes to scan

### Administration Page (2 tabs)

#### "Apply Filters" Tab
- Automatic execution on new message arrival
- Manual execution
- Execution after junk mail check
- Option to remove own email addresses

#### "Filter Management" Tab
- **Toolbar**: New / Delete / Clone / Edit / Export / Import
- **Adaptive filter table** (fills available height) with 4 columns:
  - Filter (name)
  - Smart Filter (condensed syntax)
  - Destination (target folder)
  - Active (checkbox)
- Drag reordering: ⤒ Top / ↑ Up / ↓ Down / ⤓ Bottom
- Targeted execution: all filters or selected filter

### Filter Editor (Modal Window)
- Filter name
- Application options (new message, manual, after junk check)
- Per-filter account selection
- Match mode: AT LEAST ONE condition / ALL conditions
- Dynamic conditions with +/- buttons (field, operator, value)
- Browsable folder tree with search to choose destination
- Real-time Smart Filter preview
- Editable Smart Filter textarea with bidirectional sync

### Toolbar Popup
- **Run all filters** — scans configured accounts' inboxes
- **Run filters on this folder** — runs on selected folder(s)
- **Filter management** — opens the administration page

### Logging
- Concise per-folder summary with per-filter and per-message detail (author + subject)
- No verbose logging in normal operation

## Project Structure

```
thunderbird-filter-move-mail/
├── addon/                          # Thunderbird Extension
│   ├── manifest.json               # Manifest V2 (TB 128+)
│   ├── _locales/
│   │   ├── ar/messages.json        # Arabic
│   │   ├── de/messages.json        # German
│   │   ├── en/messages.json        # English
│   │   ├── es/messages.json        # Spanish
│   │   ├── fr/messages.json        # French (default)
│   │   ├── it/messages.json        # Italian
│   │   ├── ja/messages.json        # Japanese
│   │   ├── nl/messages.json        # Dutch
│   │   └── zh_CN/messages.json     # Chinese (Simplified)
│   ├── background/
│   │   ├── background.html         # Background page
│   │   └── background.js           # Main script (events, messaging)
│   ├── popup/
│   │   ├── popup.html              # Toolbar button popup
│   │   ├── popup.css
│   │   └── popup.js
│   ├── options/
│   │   ├── options.html            # Administration page (2 tabs)
│   │   ├── options.css
│   │   └── options.js
│   ├── filter-editor/
│   │   ├── editor.html             # Filter editor modal
│   │   ├── editor.css
│   │   └── editor.js
│   ├── lib/
│   │   ├── storage.js              # Persistence (browser.storage.local)
│   │   ├── filter-engine.js        # Filter engine (matching + execution)
│   │   └── account-manager.js      # Account/folder management
│   └── icons/
│       ├── filter-16.svg
│       ├── filter-32.svg
│       ├── filter-48.svg
│       └── filter-128.svg
├── releases/                       # .xpi files (releases)
├── updates.json                    # Auto-update for Thunderbird
├── LICENSE                         # MIT
├── README.md                       # English documentation
└── README.fr.md                    # French documentation
```

## Installation

### From .xpi file (recommended)
1. Download the `.xpi` file from [Releases](https://github.com/mmaunier/thunderbird-filter-move-mail/releases)
2. Open Thunderbird → Menu → Tools → Add-ons
3. ⚙️ → Install Add-on From File → Select the `.xpi`

### Development mode
1. Open Thunderbird
2. Menu → Tools → Add-ons
3. ⚙️ → Debug Add-ons → Load Temporary Add-on
4. Select the `addon/manifest.json` file

## Smart Filter Syntax

```
FROM contains john@example.com AND SUBJECT contains invoice
TO is admin@company.com OR CC contains team
FROM in_addressbook
BODY contains {important keyword with spaces}
```

| Fields | `FROM`, `TO`, `CC`, `BCC`, `SUBJECT`, `BODY` |
|--------|----------------------------------------------|
| **Operators** | `contains`, `not_contains`, `is`, `is_not`, `in_addressbook`, `not_in_addressbook` |
| **Connectors** | `AND` (all conditions), `OR` (at least one) |
| **Braces** | `{value with spaces}` for multi-word values |

## Thunderbird APIs Used

| API | Usage |
|-----|-------|
| `accounts` | List accounts and identities |
| `addressBooks` | Check contacts in address books |
| `contacts` | Quick contact search |
| `messages` | List, read, and move messages |
| `mailTabs` | Get selected folder(s) (multi-selection TB 128+) |
| `storage` | Store filters and preferences |
| `i18n` | Internationalization (9 languages) |

## Permissions

| Permission | Usage |
|-----------|-------|
| `accountsRead` | Read accounts and folders |
| `addressBooks` | Access address books |
| `messagesRead` | Read messages |
| `messagesMove` | Move messages |
| `messagesDelete` | Delete messages |
| `storage` | Local storage for filters and preferences |

## Languages

- 🇫🇷 French (default)
- 🇬🇧 English
- 🇩🇪 German
- 🇪🇸 Spanish
- 🇮🇹 Italian
- 🇳🇱 Dutch
- 🇯🇵 Japanese
- 🇨🇳 Chinese (Simplified)
- 🇸🇦 Arabic

## Compatibility

- Thunderbird 128+ (Manifest V2)
- Tested with Thunderbird 147

## License

[MIT](LICENSE)

## Author

Mikael Maunier — [@mmaunier](https://github.com/mmaunier)
