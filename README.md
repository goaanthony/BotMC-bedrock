# 🎮 BotMC — Minecraft Bedrock Gateway

Passerelle qui permet à tes amis Xbox Live de rejoindre ton serveur Minecraft Bedrock **depuis l'onglet Amis**, sans taper d'IP. Basé sur [bedrock-portal](https://github.com/LucienHH/bedrock-portal).

> ⚠️ Utilise un **compte Xbox secondaire** pour le bot, jamais ton compte principal : Microsoft peut restreindre l'accès aux API Xbox des comptes utilisés ainsi.

## Comment ça marche

1. Le compte bot se connecte à Xbox Live et publie une session de jeu (NetherNet / WebRTC). Le monde apparaît dans l'onglet **Amis** de ses amis.
2. Quand quelqu'un clique « Rejoindre », la passerelle vérifie qu'il vient bien de la session, simule le début d'un monde, puis lui envoie un paquet `transfer` (mécanisme officiel de Minecraft) vers `TARGET_HOST:TARGET_PORT`.
3. Le jeu du joueur se connecte alors directement à ton vrai serveur : la passerelle n'est plus dans la boucle.
4. Une session neuve est publiée après chaque transfert (sinon un joueur ne pourrait pas revenir), et les demandes d'amis sont acceptées instantanément.

## Installation sur un serveur Linux (recommandé)

Debian, Ubuntu, Fedora, Rocky/Alma… avec systemd, en x86_64 ou ARM64.

```bash
git clone https://github.com/goaanthony/BotMC-bedrock.git
cd BotMC-bedrock
sudo ./install.sh
```

Le script :

- installe Node.js 22 si besoin (NodeSource) ;
- crée un utilisateur système `botmc` et installe le bot dans `/opt/botmc` ;
- pose les questions de configuration (serveur cible, nom du monde…) ;
- te fait connecter le compte Xbox du bot ;
- crée un service systemd qui démarre avec la machine et redémarre le bot en cas de crash ;
- installe la commande `botmc`.

Il est rejouable : relancé, il met à jour en gardant la configuration, la connexion Xbox et les logs. Options : `sudo ./install.sh --help`.

Installation sans question :

```bash
sudo ./install.sh --yes --target-host play.exemple.fr --world-name "Mon Serveur"
```

Aucun port à ouvrir : la passerelle n'utilise que des connexions sortantes (Xbox Live et WebRTC).

### La commande `botmc`

| Commande               | Rôle                                                        |
|------------------------|-------------------------------------------------------------|
| `botmc status`         | état, statistiques, joueurs actifs, derniers événements     |
| `botmc logs`           | logs en direct (Ctrl+C pour quitter)                        |
| `botmc logs errors`    | avertissements et erreurs seulement                         |
| `botmc logs file`      | fichier de log du jour, avec les stack traces               |
| `botmc start` / `stop` / `restart` | gestion du service                              |
| `botmc login [--force]`| connecte (ou change) le compte Xbox du bot                  |
| `botmc config`         | modifie `.env`, vérifie, puis propose de redémarrer         |
| `botmc debug`          | lance le bot au premier plan avec tous les logs Xbox/NetherNet |
| `botmc update`         | `git pull` du dépôt puis réinstallation                     |
| `botmc uninstall`      | désinstalle (propose de garder les données)                 |

## Lancement manuel (Windows, macOS, dev)

Node.js 20 ou plus récent est requis.

```bash
npm install
cp .env.example .env    # puis remplis au moins TARGET_HOST
npm run login           # connecte le compte Xbox du bot
npm start
```

Autres scripts : `npm run status`, `npm run check`, `npm run friends`, `npm test`, `npm run lint`.

## Configuration (`.env`)

| Variable                   | Description                                                      | Défaut                  |
|----------------------------|------------------------------------------------------------------|-------------------------|
| `BOT_MODE`                 | `gateway` (passerelle) ou `friends` (amis seulement, BDS)        | `gateway`               |
| `TARGET_HOST`              | IP ou domaine du vrai serveur Bedrock (**obligatoire** en gateway) | —                     |
| `TARGET_PORT`              | Port UDP du vrai serveur                                         | `19132`                 |
| `WORLD_NAME`               | Nom affiché sur la carte du monde                                | `Mon Serveur Minecraft` |
| `GATEWAY_MOTD`             | Sous-titre de la carte                                           | `Rejoins le serveur !`  |
| `WORLD_VERSION`            | Texte affiché comme « version » (n'a pas besoin d'être réel)     | `Passerelle`            |
| `MAX_PLAYERS`              | Nombre max de joueurs affiché                                    | `20`                    |
| `JOINABILITY`              | `friends_of_friends`, `friends_only` ou `invite_only`            | `friends_of_friends`    |
| `SESSION_REFRESH_DELAY_MS` | Délai avant de republier la session après un transfert           | `3000`                  |
| `AUTO_FRIEND_ADD`          | Ajoute les followers en ami (et retire ceux qui ne suivent plus) | `true`                  |
| `FRIEND_POLL_INTERVAL_MS`  | Mode `friends` : vérification de secours des demandes d'amis     | `30000`                 |
| `LOG_LEVEL`                | `debug`, `info`, `warn`, `error`                                 | `info`                  |
| `LOG_FORMAT`               | `auto`, `pretty` (couleurs), `plain` (texte), `json`             | `auto`                  |
| `LOG_TO_FILE`              | Écrit aussi les logs dans `LOG_DIR`                              | `true`                  |
| `LOG_DIR`                  | Dossier des fichiers de log journaliers                          | `./logs`                |
| `LOG_RETENTION_DAYS`       | Jours de logs conservés (`0` = illimité)                         | `14`                    |
| `STATS_INTERVAL_MIN`       | Résumé des statistiques dans les logs (`0` = jamais)             | `60`                    |
| `HOST_ACCOUNT_LABEL`       | Nom du compte bot dans le cache                                  | `gateway-host`          |
| `AUTH_CACHE_DIR`           | Cache des jetons Xbox (ne le partage jamais)                     | `./auth_cache`          |
| `DATA_DIR`                 | Fichier d'état lu par `botmc status`                             | `./data`                |

## Logs

- **Console** : en couleurs dans un terminal, en texte simple sous systemd (`journalctl`), ou en JSON avec `LOG_FORMAT=json`.
- **Fichiers** : `logs/botmc-AAAA-MM-JJ.log`, un par jour, avec les stack traces complètes, purgés après `LOG_RETENTION_DAYS` jours.
- **Catégories** : `SYSTÈME`, `XBOX`, `SESSION`, `JOUEUR`, `TRANSFERT`, `AMIS`, `STATS`, et `LIB` pour les logs internes de bedrock-portal / Xbox (visibles en `LOG_LEVEL=debug`).
- **Statistiques** : transferts, joueurs uniques, amis acceptés, sessions recréées, erreurs. Résumé périodique dans les logs et `botmc status` à tout moment.

## Mode BDS (alternatif)

Si tu héberges un Bedrock Dedicated Server qui sert de lobby, `BOT_MODE=friends` gère seulement les demandes d'amis du compte bot, sans publier de session. Le behavior pack de `bds-pack/` ajoute la commande `/gateway:t` qui transfère le joueur : modifie `TARGET_HOST`/`TARGET_PORT` en haut de `bds-pack/scripts/main.js`.

## Structure

```
install.sh                  installation / mise à jour / désinstallation Linux
scripts/
├── botmc                   commande de gestion (installée dans /usr/local/bin)
└── botmc.service           modèle du service systemd
src/
├── cli.js                  point d'entrée : start, gateway, friends, login, status, check
├── core/
│   ├── config.js           lecture et validation du .env
│   ├── logger.js           logs console + fichiers avec rotation
│   ├── stats.js            statistiques et fichier d'état
│   ├── ui.js               bannière, encadrés, rendu de « status »
│   ├── runtime.js          arrêt propre, résumés périodiques, filets de sécurité
│   └── auth.js             connexion Xbox du compte bot
├── gateway/
│   ├── run.js              mode passerelle
│   ├── GatewayPortal.js    BedrockPortal + correctifs de redémarrage
│   └── SessionRefresher.js republication de la session après un transfert
└── friends/
    ├── run.js              mode amis seulement
    └── FriendManager.js    acceptation des demandes d'amis
test/                       tests (node --test)
bds-pack/                   behavior pack BDS (commande /gateway:t)
```

## Dépannage

- **Le monde n'apparaît pas dans l'onglet Amis** : le joueur doit être ami avec le bot, et le multijoueur Xbox Live doit être autorisé sur les deux comptes.
- **« Server authentication error »** : le joueur ne passe pas par la session publiée (carte obsolète). Il doit relancer depuis l'onglet Amis.
- **Le transfert échoue** : le serveur cible doit être joignable en UDP depuis Internet sur `TARGET_PORT`.
- **Le bot ne démarre pas** : `botmc logs errors`, puis `botmc login --force` si la connexion Xbox a expiré.
- **Comportement bizarre** : `botmc debug` affiche tout le détail du protocole ; envoie ces logs avec ton rapport.
