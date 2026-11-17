# 🎮 Minecraft Bedrock Gateway

Passerelle qui permet à tes amis Xbox Live de rejoindre ton serveur Minecraft Bedrock **depuis l'onglet Amis**, sans avoir à taper d'IP. Basé sur [bedrock-portal](https://github.com/LucienHH/bedrock-portal).

## Comment ça marche

1. Le compte bot se connecte à Xbox Live et publie une session de jeu (NetherNet / WebRTC).
2. Ses amis voient le monde dans l'onglet **Amis** de Minecraft.
3. Quand quelqu'un clique « Rejoindre », la passerelle vérifie qu'il vient bien de la session, puis lui envoie un paquet `transfer` vers `TARGET_HOST:TARGET_PORT`.
4. Les demandes d'amis envoyées au bot sont acceptées instantanément, et la personne est invitée directement.

Après chaque transfert, la passerelle publie une session neuve (dès que personne n'est en train de se connecter) : sinon un joueur déjà transféré ne pourrait pas revenir. Si Xbox Live coupe la connexion, la session est aussi recréée automatiquement.

> ⚠️ Utilise un **compte Xbox secondaire** pour le bot, jamais ton compte principal : Microsoft peut restreindre l'accès aux API Xbox des comptes qui les utilisent ainsi.

## Installation

Node.js 18 ou plus récent est requis.

```bash
npm install
cp .env.example .env
```

Remplis au minimum `TARGET_HOST` (et `TARGET_PORT` si ce n'est pas 19132) dans `.env`.

## Lancement

```bash
npm start
```

Au premier lancement, un lien Microsoft et un code s'affichent : ouvre le lien, entre le code et connecte-toi avec le compte du bot. Les jetons sont ensuite gardés dans `auth_cache/` (ne le partage jamais).

Pour voir le détail du protocole en cas de problème :

```bash
DEBUG=bedrock-portal* npm start
```

## Configuration (`.env`)

| Variable                  | Description                                                     | Défaut                  |
|---------------------------|-----------------------------------------------------------------|-------------------------|
| `TARGET_HOST`             | IP ou domaine du vrai serveur Bedrock (**obligatoire**)         | —                       |
| `TARGET_PORT`             | Port UDP du vrai serveur                                        | `19132`                 |
| `WORLD_NAME`              | Nom affiché sur la carte du monde                               | `Mon Serveur Minecraft` |
| `GATEWAY_MOTD`            | Sous-titre de la carte                                          | `Rejoins le serveur !`  |
| `WORLD_VERSION`           | Texte affiché comme « version » (n'a pas besoin d'être réel)    | `Passerelle`            |
| `MAX_PLAYERS`             | Nombre max de joueurs affiché                                   | `20`                    |
| `JOINABILITY`             | `friends_of_friends`, `friends_only` ou `invite_only`           | `friends_of_friends`    |
| `AUTO_FRIEND_ADD`         | Ajoute les followers en ami (et retire ceux qui ne suivent plus)| `true`                  |
| `FRIEND_POLL_INTERVAL_MS` | Mode BDS : vérification de secours des demandes d'amis          | `30000`                 |
| `AUTH_CACHE_DIR`          | Dossier du cache des jetons Xbox                                | `./auth_cache`          |
| `HOST_ACCOUNT_LABEL`      | Nom du compte bot dans le cache                                 | `gateway-host`          |

## Mode BDS (alternatif)

Si tu héberges un Bedrock Dedicated Server qui sert de lobby, `npm run friends` gère seulement les demandes d'amis du compte bot, sans publier de session. Le behavior pack de `bds-pack/` ajoute la commande `/gateway:t` qui transfère le joueur. Modifie `TARGET_HOST`/`TARGET_PORT` en haut de `bds-pack/scripts/main.js`.

## Structure

```
src/
├── portal.js         ← Point d'entrée principal (npm start)
├── gatewayPortal.js  ← BedrockPortal + correctifs de redémarrage
├── config.js         ← Lecture et validation du .env
├── friend-only.js    ← Mode BDS (npm run friends)
├── friendManager.js  ← Acceptation des amis pour le mode BDS
└── dashboard.js      ← Affichage console
bds-pack/             ← Behavior pack BDS (commande /gateway:t)
```

## Dépannage

- **Le monde n'apparaît pas dans l'onglet Amis** : vérifie que le compte du joueur est bien ami avec le bot, et que l'option multijoueur Xbox Live est autorisée sur les deux comptes.
- **Le joueur est déconnecté avec « Server authentication error »** : il ne passe pas par la session publiée (lien obsolète). Il doit relancer depuis l'onglet Amis.
- **Le transfert échoue** : le serveur cible doit être joignable en UDP depuis Internet sur `TARGET_PORT`.
