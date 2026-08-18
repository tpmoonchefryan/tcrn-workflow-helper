<!-- tcrn-doc-synced-to: CONTRIBUTING.md bc60c3bff58804345ea57120563308e5e3512a83a84ac749c004622a980d21f3 -->

> **La version anglaise fait autorité.** Cette traduction est fournie par commodité ; en cas de divergence entre les deux, c'est le texte anglais de [CONTRIBUTING.md](./CONTRIBUTING.md) qui prévaut.

[English](./CONTRIBUTING.md) · [简体中文](./CONTRIBUTING.zh-CN.md) · [日本語](./CONTRIBUTING.ja.md) · [한국어](./CONTRIBUTING.ko.md) · Français

# Contribuer

Ce dépôt distribue un fichier qu'un inconnu est censé vérifier à la main, ainsi qu'une charge utile Skill qui enseigne à un agent comment piloter TCRN Workflow. Presque toutes les règles ci-dessous en découlent : ce qui est livré est une affirmation à propos d'octets, donc **un changement qui rend cette affirmation plus difficile à vérifier est une régression**, même s'il rend le code plus élégant.

## Avant de proposer un changement

Exécutez `pnpm test` en entier. Pas un sous-ensemble, et pas `pnpm verify` à sa place — les deux répondent à des questions différentes, et un commit étiqueté a déjà été livré avec 22 tests rouges sur 72 parce que `verify` avait été exécuté à la place. `verify` vérifie que les artefacts correspondent à leurs empreintes ; il ne dit rien sur l'accord entre l'identité épinglée et la provenance.

Tout changement touchant `bootstrap/trusted-bootstrap.mjs`, `IDENTITY`, une constante `EXPECTED_*`, ou quoi que ce soit sous `manifests/` doit exécuter la suite complète **avant** d'être commité, et `pnpm push-gate` **après** — cette porte juge l'arbre commité, et l'exécuter plus tôt ne fait que vous renvoyer vos propres octets non commités.

## Trois règles sans exception

**Zéro dépendance d'exécution.** Le bootstrap est un seul fichier et le reste. Une dépendance signifierait qu'un inconnu ayant vérifié une empreinte fait confiance à une chaîne d'approvisionnement qu'il ne peut pas voir d'ici.

**Aucun réseau sur le chemin de vérification.** La validation est hors ligne par construction. Si un contrôle a besoin du réseau pour trancher, ce n'est pas un contrôle que l'utilisateur peut répéter.

**L'empreinte d'ancrage est publiée en six endroits, ou elle n'est pas publiée.** Les étapes qui changent les octets du bootstrap changent la valeur que l'utilisateur vérifie à la main, et une ancre périmée dans l'un quelconque de ces documents dit à ce lecteur que le téléchargement a été altéré. `push-gate` échoue sur une ancre manquante **et** sur une ancre remplacée, précisément pour cela.

## Publications

`RELEASING.md` est la cérémonie, dans l'ordre, et cet ordre n'est pas cosmétique : la suite réécrit `artifacts/`, donc le manifeste candidat est lié **après** elle et non avant, et l'archive source est construite **après** que l'ancre est définitive, car elle couvre les documents qui la portent. Lisez-le plutôt que de le reconstituer.

Le fichier de provenance est une **copie octet par octet** de l'énoncé généré par le dépôt Workflow. Ne l'écrivez pas à la main, et ne refusez pas de le mettre à jour : il existe un générateur, et il vit dans l'autre dépôt.

## Traductions

Les documents anglais sont la source normative. Chaque traduction porte une épingle `tcrn-doc-synced-to` nommant sa source et l'empreinte SHA-256 de celle-ci, et un changement structurel d'un document anglais est reflété dans le **même** changement — une traduction de commodité qui prend silencieusement du retard sur sa source est pire qu'une traduction absente, car elle se lit comme actuelle.

## À quoi ressemble un bon signalement

Pour un échec de vérification : la version, la valeur que vous avez calculée, la valeur que le document vous disait d'attendre, et l'endroit d'où vient le fichier. Pour le reste : ce que vous attendiez, ce qui s'est passé, et la commande exacte. **Un reason code vaut mieux qu'une description du message d'erreur.**
