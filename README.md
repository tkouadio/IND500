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
│  └─ dump_tp1_orig.sql
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
│     ├─ q1_a_commandes_par_etat.csv
│     ├─ q4_b_repartition_vendeurs.csv
│     └─ ...
├─ src/main/java/com/tp2/Harness.java
├─ pom.xml
└─ README.md
```

> Le mapping **tables PG → collections Mongo** est déclaré dans `Harness.java` (`TABLES`).
> Les tables **préfixées** `tp1_ind500_*` sont exportées en JSON **sans préfixe** (ex. `orders.json`) et importées telles quelles (`orders`, `customers`, …).

## Installation

```bash
mvn -q -DskipTests package
```

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
* `artifacts/report.txt` : rapport clair (généré **après `create-indexes.js`**), ex. :

  ```
  URI Compass: mongodb://127.0.0.1:32825/tp2_ind500?directConnection=true

  Counts (brutes) — après IMPORT:
  orders                         : 99 432
  customers                      : 99 437
  …

  Counts (modélisées):
  tp2_orders                     : 99 432
  tp2_products                   : 32 328
  tp2_sellers_geo                : 3 095
  tp2_leads                      : 8 000

  Indexes:
  tp2_orders:
    - _id_
    - order_purchase_timestamp_1
    - review.review_comment_message_text
    …

  tp2_sellers_geo:
    - _id_
    - geo.location_2dsphere
  ```
* `artifacts/csv/*.csv` : **exports CSV des résultats de requêtes**.
  Le harness **scanne la base** et exporte toute collection dont le nom commence par `__res_` ou `__csv_`.
  Le fichier CSV est nommé **sans le préfixe** (ex. `__res_q1_b_clients_reels` → `q1_b_clients_reels.csv`).

### Affichage console (scripts de requêtes)

Pour toute requête qui renvoie **> 50 lignes** :

* les **50 premières** lignes sont affichées,
* **lignes 51 à 53** : `…` (pointillés),
* **ligne 54** : **“(N lignes au total)”**.

Cela rend la console lisible tout en conservant l’**export CSV complet** en parallèle.

## Scripts étudiants attendus

Placer dans `scripts/` :

* `build-modeled.js` (pipelines `$lookup`, `$set`, `$merge` ; **avec** `use('tp2_ind500');`)
* `normalize.js` (création des champs normalisés)
* `create-indexes.js` (index date, texte, 2dsphere, etc.)
* `all-queries.js` (Q1–Q5 groupes A & B)
* `advanced-queries.js` (`$near`, `$text`, `$bucket`, `$facet`)

> Les scripts fournis créent, pour l’export, des **collections techniques** de résultats préfixées `__res_*` (ou `__csv_*`).
> **Aucune commande `mongoexport` n’est nécessaire** côté scripts : le harness exporte automatiquement vers `artifacts/csv/`.

## Dépannage (FAQ)

* **`Dump introuvable`** : place `dump_tp1_orig.sql` dans `dump/`.
* **Docker non lancé** : démarre Docker Desktop/Engine.
* **Compass “ECONNREFUSED”** : relance **avec** `--hold` et utilise **l’URI affichée**.
* **Counts brutes = 0** : inspecte `data/` (fichiers vides/manquants). Refaire un run **sans** `--skip-pg`.
* **Counts modélisées = 0** : problème dans `build-modeled.js` (`$merge.on`, champ manquant, etc.).
* **Pas de CSV générés** : vérifier que les scripts créent bien des collections de résultats **nommées `__res_*` ou `__csv_*`**.

## Personnalisation

* **Mapping tables** : modifier `TABLES` dans `Harness.java`.
* **Sauter Postgres** : `--skip-pg` pour réutiliser `data/`.
* **HOLD** : `--hold` pour garder Mongo en ligne.
* **Nom des exports CSV** : basé sur le nom des **collections de résultats** après suppression du préfixe.

## .gitignore (suggestion)

```
/data/
/artifacts/
/target/
/.idea/
/.vscode/
```

## Licence / Auteurs

Projet pédagogique – harness de correction TP2 (Testcontainers Java).
Java 17+, Docker requis.
Contact : chargé de TP / enseignant responsable.