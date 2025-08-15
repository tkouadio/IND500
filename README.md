# TP2 Harness – Testcontainers (Java)

Harness Java pour corriger le TP2 **PostgreSQL → MongoDB** :

* restaure le **dump PostgreSQL**,
* exporte les **11 tables** en **JSON**,
* importe dans **MongoDB**,
* exécute les scripts en **2 phases**

  1. `build-modeled.js` → `normalize.js` → `create-indexes.js`
  2. `all-queries.js` → `advanced-queries.js`
* génère un **rapport** avec les **counts** et les **indexes** (après phase 1),
* **exporte automatiquement en CSV** les **résultats de requêtes** créés par les scripts (collections temporaires préfixées `__res_*` ou `__csv_*`),
* propose un mode **HOLD** pour ouvrir la base dans **MongoDB Compass**.

## Prérequis

* **Docker Desktop** (ou Docker Engine) en marche
* **Java 17+**
* **Maven 3.8+**
* Optionnel : **MongoDB Compass** (visualisation)

## Arborescence

```

tp2-harness-java/
├─ dump/
│  └─ dump\_tp1\_orig.sql
├─ scripts/
│  ├─ build-modeled.js
│  ├─ normalize.js
│  ├─ create-indexes.js
│  ├─ all-queries.js
│  └─ advanced-queries.js
├─ data/                           # JSON exportés depuis Postgres
├─ artifacts/
│  ├─ report.txt                   # Rapport lisible (après phase 1)
│  └─ csv/                         # CSV exportés automatiquement (après phase 2)
│     ├─ q1\_a\_commandes\_par\_etat.csv
│     ├─ q4\_b\_repartition\_vendeurs.csv
│     └─ ...
├─ src/main/java/com/tp2/Harness.java
├─ pom.xml
└─ README.md

````

> Le mapping **tables PG → collections Mongo** est déclaré dans `Harness.java` (`TABLES`).
> Les tables **préfixées** `tp1_ind500_*` sont exportées en JSON **sans préfixe** (ex. `orders.json`) et importées telles quelles (`orders`, `customers`, …).

## Installation

```bash
mvn -q -DskipTests package
````

## Utilisation

### Run complet (recommandé avant livraison)

Restaure PG → export JSON → importe Mongo → **Phase 1 (build+normalize+indexes)** → **rapport** → **Phase 2 (requêtes)** → **exports CSV** :

```bash
java -jar target/tp2-harness-1.0.0.jar
```

### Mode HOLD (ouvrir dans Compass)

Garde le conteneur MongoDB en vie à la fin et affiche l’URI Compass :

```bash
java -jar target/tp2-harness-1.0.0.jar --hold
# ou via env : HOLD=1 java -jar target/tp2-harness-1.0.0.jar
```

Copie l’URI affichée, ex. :

```
mongodb://127.0.0.1:32825/tp2_ind500?directConnection=true
```

Puis **Compass** → “Paste your connection string” → **Connect**.

> Le **port change à chaque run** : utilise l’URI affichée par **ce** run.

### Rejouer sans Postgres (plus rapide)

Réutilise les JSON existants dans `data/` :

```bash
java -jar target/tp2-harness-1.0.0.jar --skip-pg
# ou via env : SKIP_PG=1 java -jar target/tp2-harness-1.0.0.jar
```

## Sorties & livrables

* `data/` : 11 fichiers JSON (**1 document/ligne**)
* `artifacts/report.txt` : rapport clair (généré **après `create-indexes.js`**)
* `artifacts/csv/*.csv` : **exports CSV des résultats de requêtes**

### Affichage console (scripts de requêtes)

Pour toute requête qui renvoie **> 50 lignes** :

* 50 premières lignes affichées
* ligne 51–53 : `...`
* ligne 54 : nombre total de lignes

## Scripts étudiants attendus

Placer dans `scripts/` :

* `build-modeled.js`
* `normalize.js`
* `create-indexes.js`
* `all-queries.js`
* `advanced-queries.js`

> Les collections de résultats sont nommées `__res_*` ou `__csv_*`.

## Dépannage (FAQ)

* **`Dump introuvable`** : placer `dump_tp1_orig.sql` dans `dump/` ou utiliser l’image `v0.1.2` qui embarque le dump.
* **Docker non lancé** : démarrer Docker Desktop
* **Pas de CSV générés** : vérifier les noms des collections (`__res_*` / `__csv_*`)

## Personnalisation

* **Mapping tables** : éditer `TABLES` dans `Harness.java`
* **Nom des exports CSV** : basé sur le nom de la collection après suppression du préfixe

# Utilisation via Image Docker

Une image Docker publique est disponible :

```
ghcr.io/tkouadio/tp2-harness
```

**Choisissez votre OS** : les commandes diffèrent légèrement entre bash, PowerShell et cmd.

## Prérequis : récupérer la dernière image

```bash
docker pull ghcr.io/tkouadio/tp2-harness:latest
```

## Option 1: Lancer un run complet (dump + scripts **dans l’image**)
> - NB: Le rapport et les fichiers CSV générés(./artifacts) sont les résultats attendus du TP et servent de base pour la correction.

### Linux / macOS (bash)

```bash
mkdir -p data artifacts
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  --add-host=host.docker.internal:host-gateway \
  -e SKIP_DELETE_DATA=1 -e HOLD=0 \
  -v "$PWD/data:/app/data" \
  -v "$PWD/artifacts:/app/artifacts" \
  ghcr.io/tkouadio/tp2-harness:latest
```

### Windows – PowerShell

```powershell
mkdir data,artifacts -ea 0
docker run --rm `
  -v //var/run/docker.sock:/var/run/docker.sock `
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock `
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal `
  --add-host=host.docker.internal:host-gateway `
  -e SKIP_DELETE_DATA=1 -e HOLD=0 `
  -v "${PWD}/data:/app/data" `
  -v "${PWD}/artifacts:/app/artifacts" `
  ghcr.io/tkouadio/tp2-harness:latest
```

### Windows – cmd.exe

```cmd
mkdir data artifacts
docker run --rm ^
  -v //var/run/docker.sock:/var/run/docker.sock ^
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock ^
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal ^
  --add-host=host.docker.internal:host-gateway ^
  -e SKIP_DELETE_DATA=1 -e HOLD=0 ^
  -v "%cd%\data:/app/data" ^
  -v "%cd%\artifacts:/app/artifacts" ^
  ghcr.io/tkouadio/tp2-harness:latest
```

## Option 2: Lancer en **remplaçant les scripts** par ceux d’un étudiant

>   **Important avant de lancer :**
> 
> - Le dossier `scripts/` doit contenir les fichiers `.js` de l’étudiant.  
> - Le dossier `dump/` doit contenir le dump PostgreSQL fourni.  
> - Le dossier `data/` recevra les **JSON exportés** par le Testcontainer.  
> - Le dossier `artifacts/` recevra **le rapport et les CSV résultats générés**.

> **NB:** L'étudiant doit également respecter le contrat de correction fournit.

### Linux / macOS (bash)

```bash
mkdir -p data artifacts
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  --add-host=host.docker.internal:host-gateway \
  -v "$PWD/scripts:/app/scripts" \
  -v "$PWD/dump:/app/dump" \
  -v "$PWD/data:/app/data" \
  -v "$PWD/artifacts:/app/artifacts" \
  ghcr.io/tkouadio/tp2-harness:latest
```

### Windows – PowerShell

```powershell
mkdir data,artifacts -ea 0
docker run --rm `
  -v //var/run/docker.sock:/var/run/docker.sock `
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock `
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal `
  --add-host=host.docker.internal:host-gateway `
  -v "${PWD}/scripts:/app/scripts" `
  -v "${PWD}/dump:/app/dump" `
  -v "${PWD}/data:/app/data" `
  -v "${PWD}/artifacts:/app/artifacts" `
  ghcr.io/tkouadio/tp2-harness:latest
```

### Windows – cmd.exe

```cmd
mkdir data artifacts
docker run --rm ^
  -v //var/run/docker.sock:/var/run/docker.sock ^
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock ^
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal ^
  --add-host=host.docker.internal:host-gateway ^
  -v "%cd%\scripts:/app/scripts" ^
  -v "%cd%\dump:/app/dump" ^
  -v "%cd%\data:/app/data" ^
  -v "%cd%\artifacts:/app/artifacts" ^
  ghcr.io/tkouadio/tp2-harness:latest
```

## Option 3: Lancer en **mode rapide** (JSON déjà exportés)

### Linux / macOS (bash)

```bash
mkdir -p data artifacts
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  --add-host=host.docker.internal:host-gateway \
  -e SKIP_PG=1 -e HOLD=0 \
  -v "$PWD/scripts:/app/scripts" \
  -v "$PWD/data:/app/data" \
  -v "$PWD/artifacts:/app/artifacts" \
  ghcr.io/tkouadio/tp2-harness:latest
```

### Windows – PowerShell

```powershell
mkdir data,artifacts -ea 0
docker run --rm `
  -v //var/run/docker.sock:/var/run/docker.sock `
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock `
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal `
  --add-host=host.docker.internal:host-gateway `
  -e SKIP_PG=1 -e HOLD=0 `
  -v "${PWD}/scripts:/app/scripts" `
  -v "${PWD}/data:/app/data" `
  -v "${PWD}/artifacts:/app/artifacts" `
  ghcr.io/tkouadio/tp2-harness:latest
```

### Windows – cmd.exe

```cmd
mkdir data artifacts
docker run --rm ^
  -v //var/run/docker.sock:/var/run/docker.sock ^
  -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock ^
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal ^
  --add-host=host.docker.internal:host-gateway ^
  -e SKIP_PG=1 -e HOLD=0 ^
  -v "%cd%\scripts:/app/scripts" ^
  -v "%cd%\data:/app/data" ^
  -v "%cd%\artifacts:/app/artifacts" ^
  ghcr.io/tkouadio/tp2-harness:latest
```

## Dépannage rapide

* **Docker Desktop** doit être lancé.
* Si `Dump introuvable`, utiliser `v0.1.2` (dump embarqué) ou monter `dump/` avec `dump_tp1_orig.sql`.
* Sous **cmd.exe**, retour à la ligne avec `^` ; sous **PowerShell** avec la backtick `` ` `` ; sous **bash** avec `\`.

```