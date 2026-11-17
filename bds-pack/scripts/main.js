/**
 * Gateway Transfer — Script pour Bedrock Dedicated Server (BDS) 1.26+
 * Commande: /gateway:t  — transfère le joueur vers le vrai serveur.
 * Raccourci chat: désactivé (chatSend nécessite Beta APIs séparé)
 */
import { CommandPermissionLevel, system, world } from "@minecraft/server";

const TARGET_HOST = "72.61.198.158";
const TARGET_PORT = 19132;

function transferPlayer(player) {
  try {
    player.sendMessage("\u00a7e[Passerelle] \u00a7fConnexion au serveur principal...");
    player.runCommand(`transfer ${TARGET_HOST} ${TARGET_PORT}`);
    console.log(`[Gateway] Transfert: ${player.name} -> ${TARGET_HOST}:${TARGET_PORT}`);
  } catch (err) {
    console.error(`[Gateway] Erreur de transfert pour ${player.name}: ${err}`);
    try {
      player.sendMessage("\u00a7c[Passerelle] \u00a7fEchec du transfert. Reessaie avec /gateway:t");
    } catch (_) {}
  }
}

// 1. Commande officielle /gateway:t (stable, pas besoin de Beta APIs)
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "gateway:t",
      description: "Transfere vers le serveur Minecraft principal",
      permissionLevel: CommandPermissionLevel.Any
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!player || player.typeId !== "minecraft:player") return;
      system.run(() => transferPlayer(player));
    }
  );
});

// 2. Raccourci chat via Beta APIs (activé dans level.dat — beta_apis: true)
try {
  if (world.beforeEvents?.chatSend) {
    world.beforeEvents.chatSend.subscribe((event) => {
      const msg = event.message.trim().toLowerCase();
      if (msg === "!t" || msg === "/t" || msg === "t") {
        event.cancel = true;
        system.run(() => transferPlayer(event.sender));
      }
    });
    console.log("[Gateway] Raccourci chat !t actif.");
  } else {
    console.warn("[Gateway] chatSend non disponible — utilise /gateway:t a la place.");
  }
} catch (e) {
  console.warn("[Gateway] chatSend indisponible: " + e);
}

// 3. Message d'accueil au spawn
world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const { player } = event;
  system.runTimeout(() => {
    try {
      player.sendMessage("\n\u00a76===================================");
      player.sendMessage(" \u00a7aBienvenue sur la Passerelle !");
      player.sendMessage(" \u00a7fTape \u00a7e/gateway:t\u00a7f pour rejoindre");
      player.sendMessage(" \u00a7fle serveur principal.");
      player.sendMessage("\u00a76===================================\n");
    } catch (_) {}
  }, 20);
});

// 4. Log de deconnexion
world.afterEvents.playerLeave.subscribe((event) => {
  console.log(`[Gateway] ${event.playerName} a quitte la passerelle.`);
});

console.log(`[Gateway] Actif - /gateway:t -> ${TARGET_HOST}:${TARGET_PORT}`);
