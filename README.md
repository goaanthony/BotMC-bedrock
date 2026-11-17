# 🎮 Minecraft Bedrock Gateway

Passerelle automatique qui permet à des amis Xbox Live de rejoindre un serveur Minecraft Bedrock privé.

## Comment ça marche

1. Le bot s'authentifie sur Xbox Live et publie une session via NetherNet (WebRTC).
2. Tes amis voient le monde dans l'onglet **Amis** de Minecraft.
3. Quand quelqu'un clique "Rejoindre", il est automatiquement redirigé vers le vrai serveur.
4. Les demandes d'amis sont acceptées instantanément via WebSocket Xbox RTA.

## Installation

```bash
npm install
cp .env.example .env
# Remplis .env avec l'IP/port de ton serveur
```

## Configuration (`.env`)

| Variable              | Description                              | Défaut          |
|-----------------------|------------------------------------------|-----------------|
| `TARGET_HOST`         | IP ou domaine du vrai serveur Bedrock    | `72.61.198.158` |
| `TARGET_PORT`         | Port UDP du vrai serveur                 | `19132`         |
| `WORLD_NAME`          | Nom du monde affiché chez les amis       | `Mon Serveur`   |
| `GATEWAY_MOTD`        | MOTD de la passerelle                    | `Rejoins !`     |
| `MAX_PLAYERS`         | Nb max de joueurs affichés               | `20`            |
| `FRIEND_POLL_INTERVAL_MS` | Intervalle d'acceptation amis (ms)   | `30000`         |
| `AUTH_CACHE_DIR`      | Dossier de cache des tokens Xbox         | `./auth_cache`  |
| `HOST_ACCOUNT_LABEL`  | Label du compte bot dans le cache        | `gateway-host`  |

## Lancement

```bash
# Mode passerelle complète (NetherNet + acceptation amis)
npm start

# Mode BDS : acceptation amis uniquement (si le BDS tourne séparément)
npm run friends
```

Au premier lancement, une URL d'authentification Microsoft s'affiche.  
Ouvre-la dans ton navigateur et connecte-toi avec le compte Xbox du bot.

## Structure

```
src/
├── portal.js       ← Point d'entrée principal (mode NetherNet)
├── friend-only.js  ← Mode BDS (amis uniquement)
├── friendManager.js← Acceptation automatique des amis Xbox Live
├── xboxAuth.js     ← Authentification Xbox Live (prismarine-auth)
└── dashboard.js    ← Interface console colorée

bds-pack/           ← Behavior pack BDS (commande /gateway:t)
```

## Modes

| Commande          | Usage                                                   |
|-------------------|---------------------------------------------------------|
| `npm start`       | Passerelle complète via NetherNet — recommandé          |
| `npm run friends` | BDS tourne en local, ce script gère juste les amis Xbox |
