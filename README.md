# routeur-modele

Mod pour Claude Code qui choisit, pour chaque demande, le modèle le moins cher capable d'y répondre correctement.

## Fonctionnement

1. À chaque message que tu envoies, Haiku lit ta demande et la classe : **simple**, **moyen**, **complexe** ou **suite** (simple confirmation comme « ok vas-y »).
2. Toutes les requêtes de ce tour partent ensuite vers le modèle correspondant :

| Palier | Modèle |
| --- | --- |
| simple | Haiku |
| moyen | Sonnet |
| complexe | Opus |
| suite | même modèle que le tour précédent |

3. La ligne d'état sous le prompt affiche le choix, par ex. `Routeur : Sonnet (moyen)`.

Les sous-agents gardent leur propre modèle. Si le classement échoue, le palier précédent est conservé (Sonnet par défaut). En cas de doute entre deux paliers, le classeur choisit le plus élevé.

## Commandes

- `/routeur` ou `/routeur stats` : mode actuel et répartition des demandes de la session
- `/routeur auto` : classement automatique (par défaut)
- `/routeur haiku`, `/routeur sonnet`, `/routeur opus` : forcer un modèle jusqu'à `/routeur auto`
- `/routeur off` : désactiver le routeur (modèle de la session)

Le mode choisi est mémorisé d'une session à l'autre.

## À savoir

- Le classement coûte un tout petit appel à Haiku par message.
- Changer de modèle entre deux tours fait repartir le cache de prompt de zéro pour ce modèle : sur une très longue conversation qui alterne souvent, l'économie est moindre. Pour une longue session sur une tâche difficile, `/routeur opus` évite ces changements.

## Installation

Dans une session Claude Code (terminal) :

```
/plugin install routeur-modele --marketplace Badicevice/routeur-modele
```

Réponds `y` pour ajouter le marketplace, puis choisis la portée (utilisateur recommandé).

Depuis un shell :

```
claude plugin install routeur-modele --marketplace Badicevice/routeur-modele
```

Dans l'application de bureau : + à côté de la zone de saisie → Plugins → Add marketplace avec `Badicevice/routeur-modele`, puis Add plugin.

Le dépôt est privé : l'installation ne marche que pour un compte GitHub qui peut le lire, sur une machine qui a déjà un accès git à github.com (clé SSH, ou `gh auth login` puis `gh auth setup-git`).
