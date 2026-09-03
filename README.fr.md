<div align="center">

# TCRN Workflow Helper

### Vérifiez un seul fichier à la main, une seule fois. Il refuse tout le reste à votre place

**Un amorceur d'un seul fichier, sans aucune dépendance. Il prouve qu'une version est exactement celle qui a été publiée, avant qu'une seule de ses lignes ne s'exécute.**

[简体中文](./README.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · Français

![status](https://img.shields.io/badge/status-1.0.1-blue?style=flat-square) ![deps](https://img.shields.io/badge/dependencies-0-success?style=flat-square) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen?style=flat-square) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical?style=flat-square)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational?style=flat-square) ![network](https://img.shields.io/badge/network-none-important?style=flat-square) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet?style=flat-square) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue?style=flat-square)

[Vérifiez d'abord ce fichier](#vérifiez-dabord-ce-fichier) · [Ce que cela résout](#ce-que-cela-résout) · [Pour qui](#pour-qui) · [Ce que cela impose](#ce-que-cela-impose) · [Démarrer en trois minutes](#démarrer-en-trois-minutes) · [État actuel](#état-actuel) · [Documentation complète](#documentation-complète)

</div>

<table>
<tr>
<td align="center" width="25%">

### 1
fichier<br><sub>L'amorceur entier. Vous le lisez d'une traite</sub>

</td>
<td align="center" width="25%">

### 1
vérification manuelle<br><sub>Faite une fois, le refus devient automatique</sub>

</td>
<td align="center" width="25%">

### 0
dépendance<br><sub>Aucun réseau, aucune télémétrie</sub>

</td>
<td align="center" width="25%">

### 0
`--force`<br><sub>L'option n'existe pas, elle n'est pas désactivée</sub>

</td>
</tr>
</table>

---

## Vérifiez d'abord ce fichier

L'amorceur est la seule chose que vous ayez jamais à croire. Vérifiez-le donc avant de croire quoi que ce soit qu'il vous dise. Une commande, une comparaison :

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

Cette empreinte est publiée à trois endroits : ici, dans `SECURITY.md`, et dans les notes de version GitHub. Trois sources indépendantes qui se contrôlent mutuellement.

> [!IMPORTANT]
> Si ce que vous calculez ne correspond pas, arrêtez-vous. N'exécutez rien, et n'essayez pas quand même. Une divergence, c'est le dispositif qui fonctionne.

---

## Ce que cela résout

Une compétence ou un flux de travail arrive depuis un dépôt, et rien ne prouve que les octets que vous allez exécuter sont ceux que quelqu'un a réellement relus.

TCRN Workflow Helper ramène ce problème à une seule vérification manuelle. Une fois l'amorceur vérifié, les octets de version acceptés sont décidés par la cryptographie et non par votre jugement.

Il n'y a pas de `--force`, parce que l'option n'existe pas. Ce n'est ni un commutateur désactivé par défaut, ni une opération dangereuse derrière une confirmation. Elle est absente du programme.

---

## Pour qui

| ✓ Adapté si | ✗ Pas adapté si |
| :--- | :--- |
| Vous exécutez TCRN Workflow sur votre propre machine et voulez que les octets soient confirmés avant que du code ne s'exécute. | Vous n'avez pas besoin de garantie de provenance pour les octets d'une version. |
| Vous acceptez une vérification manuelle en échange d'un refus automatique par la suite. | Vous acceptez d'exécuter ce que vous avez téléchargé. |

---

## Ce que cela impose

| Garantie | Comment cela fonctionne |
| :--- | :--- |
| **Artefacts reproductibles** | L'archive de compétence, l'archive de sources et le SBOM sont déterministes. Une relecture CI depuis un clone propre les reconstruit de zéro et affirme que les empreintes correspondent à celles publiées. N'importe qui peut reconstruire les octets et vérifier. |
| **Identité de version exacte** | La version acceptée de Workflow est épinglée par l'URL du dépôt, la version, le commit, l'arbre et l'objet d'étiquette annotée, le tout vérifié contre un vrai clone Git. Les identifiants d'objets Git sont des empreintes de contenu : le lien s'authentifie lui-même. |
| **Octets de version épinglés** | Les empreintes de l'archive et de la provenance acceptées sont compilées dans l'amorceur lui-même. Toute autre archive échoue en fermeture avec `IDENTITY_MISMATCH`. |
| **Anti-retour en arrière** | Versions immuables GitHub : les étiquettes ne peuvent pas être déplacées, les fichiers ne peuvent pas être remplacés. Une version antérieure échoue aussi à la comparaison d'empreintes, car chaque amorceur n'accepte qu'une seule archive. |
| **Défense contre les archives hostiles** | Traversée de chemin, chemins absolus, caractères de contrôle, chemins non NFC, doublons et collisions de casse, liens, fichiers spéciaux, altération d'empreinte par entrée, plafonds d'entrées et d'octets : tout est refusé avant l'extraction. |
| **Protection de l'environnement réel** | Installation, mise à jour, réinstallation et désinstallation n'opèrent qu'à l'intérieur de racines jetables `tcrn-helper-test-*`. Tout chemin contenant un composant `.claude` ou `.codex`, quelle que soit la casse, est refusé avant même de sonder le système de fichiers, avec `LIVE_LOCATION_FORBIDDEN`. |
| **Cycle de vie transactionnel** | Chaque modification est une transaction préparée et journalisée, dont la reprise après incident est prouvée par une injection réelle de `SIGKILL`. Une opération échouée laisse l'état antérieur identique à l'octet près, sans résidu. |

---

## Démarrer en trois minutes

```sh
# lancer la suite de preuves complète (hors ligne ; comptez 10 à 20 minutes, elle inclut une vraie injection SIGKILL)
npm test

# valider un ensemble de version avant que quoi que ce soit ne s'exécute
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>
```

<details>
<summary><b>Les autres commandes de l'amorceur</b></summary>

<br>

```sh
# vérifier, en lecture seule, une copie déposée par un installateur dans le dossier des compétences
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <dossier-competences/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# résoudre exactement un clone Workflow approuvé (refuse l'ambiguïté, les liens symboliques, les arbres modifiés)
node bootstrap/trusted-bootstrap.mjs resolve --root <clone-workflow>
```

</details>

> [!NOTE]
> Le succès émet un unique reçu JSON en forme canonique (`TRUST_VALIDATED`, `ROOT_RESOLVED`, `NETWORK_PLAN_APPROVED`, `INSTALL_COMPLETED`, `UNINSTALL_COMPLETED`). L'échec émet un unique code de raison stable. Rien entre les deux.

---

## État actuel

- `1.0.1` est la première version acceptée et prend en charge exactement TCRN Workflow `v1.0.1`.
- L'amorceur est un fichier unique : zéro dépendance, aucun réseau, aucune télémétrie.
- Les opérations réseau sont planifiées, jamais exécutées : `plan-network` affiche un plan statique et n'émet aucune requête.

## Documentation complète

L'architecture, la référence des commandes, les critères et gates, et les limites connues se trouvent dans le **[wiki GitHub](https://github.com/tpmoonchefryan/tcrn-workflow/wiki)** du dépôt TCRN Workflow. Ce dépôt ne tient pas de wiki propre.

Documents de ce dépôt : [Contribuer](./CONTRIBUTING.md) · [Sécurité](./SECURITY.md) · [Code de conduite](./CODE_OF_CONDUCT.md) · [Publication](./RELEASING.md)

## Licence

Apache-2.0. Voir [LICENSE](./LICENSE) et [NOTICE](./NOTICE).
