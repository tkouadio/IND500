package com.tp2;

import org.testcontainers.containers.ContainerState;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class Harness {

  // Tables PG (préfixées) -> collections Mongo (noms "nus")
  record MapTable(String pg, String mongo) {}
  static final List<MapTable> TABLES = List.of(
      new MapTable("tp1_ind500_orders", "orders"),
      new MapTable("tp1_ind500_customers", "customers"),
      new MapTable("tp1_ind500_products", "products"),
      new MapTable("tp1_ind500_product_category_name_translation", "product_category_name_translation"),
      new MapTable("tp1_ind500_order_items", "order_items"),
      new MapTable("tp1_ind500_order_payments", "order_payments"),
      new MapTable("tp1_ind500_order_reviews", "order_reviews"),
      new MapTable("tp1_ind500_sellers", "sellers"),
      new MapTable("tp1_ind500_geolocation", "geolocation"),
      new MapTable("tp1_ind500_leads_qualified", "leads_qualified"),
      new MapTable("tp1_ind500_leads_closed", "leads_closed")
  );

  // Dossiers hôte
  static final Path ROOT        = Path.of("").toAbsolutePath();
  static final Path DUMP_FILE   = ROOT.resolve("dump/dump_tp1_orig.sql");
  static final Path DATA_DIR    = ROOT.resolve("data");
  static final Path SCRIPTS_DIR = ROOT.resolve("scripts");
  static final Path ARTIFACTS   = ROOT.resolve("artifacts");
  static final Path ARTIFACTS_CSV = ARTIFACTS.resolve("csv");

  // Flags (env ou args) : --hold / --skip-pg
  static final Map<String,String> ENV = System.getenv();
  static boolean HOLD    = "1".equals(ENV.getOrDefault("HOLD", "0"));
  static boolean SKIP_PG = "1".equals(ENV.getOrDefault("SKIP_PG", "0"));

  public static void main(String[] args) throws Exception {
    for (String a: args) {
      if ("--hold".equalsIgnoreCase(a)) HOLD = true;
      if ("--skip-pg".equalsIgnoreCase(a)) SKIP_PG = true;
    }
    Files.createDirectories(ARTIFACTS);
    Files.createDirectories(ARTIFACTS_CSV);
    if (!SKIP_PG) {
      if (Files.exists(DATA_DIR)) deleteRecursive(DATA_DIR);
      Files.createDirectories(DATA_DIR);
    } else {
      Files.createDirectories(DATA_DIR);
    }

    // 1) Postgres: restore + export JSON
    if (!SKIP_PG) {
      try (PostgreSQLContainer<?> pg = new PostgreSQLContainer<>(DockerImageName.parse("postgres:17"))
          .withDatabaseName("tp1_ind500")
          .withUsername("postgres")
          .withPassword("postgres")) {

        pg.start();
        restoreAndExport(pg);
      }
    } else {
      log("SKIP_PG=1 : on réutilise ./data (pas de Postgres).");
    }

    // 2) Mongo: import + scripts + rapport (entre phases) + export CSV + HOLD optionnel
    MongoDBContainer mongo = new MongoDBContainer(DockerImageName.parse("mongo:6.0"));
    try {
      mongo.start();
      importIntoMongoAndRunScripts(mongo);

      if (HOLD) {
        int port = mongo.getMappedPort(27017);
        String uri = "mongodb://127.0.0.1:" + port + "/tp2_ind500?directConnection=true";
        System.out.println("\nContainers en ligne. Laisse ce terminal ouvert (Ctrl+C pour arrêter).");
        System.out.println("URI Compass: " + uri);
        Thread.currentThread().join(); // bloque jusqu’à Ctrl+C
      }
    } finally {
      if (!HOLD) mongo.stop();
    }
  }

  static void restoreAndExport(PostgreSQLContainer<?> pg) throws Exception {
    if (!Files.exists(DUMP_FILE)) {
      throw new IllegalStateException("Dump introuvable: " + DUMP_FILE.toAbsolutePath());
    }
    // pousser le dump
    pg.copyFileToContainer(MountableFile.forHostPath(DUMP_FILE), "/tmp/dump.sql");

    // restaurer
    String restore = """
        set -e
        export PGPASSWORD='%s'
        echo '>> Restauration depuis /tmp/dump.sql'
        pg_restore -v -U %s -d %s /tmp/dump.sql \
          || psql -v ON_ERROR_STOP=1 -U %s -d %s -f /tmp/dump.sql
        echo '>> Restauration OK'
        """.formatted(pg.getPassword(), pg.getUsername(), pg.getDatabaseName(),
                      pg.getUsername(), pg.getDatabaseName());
    must(pg.execInContainer("bash","-lc", restore), "Restauration");

    // exporter
    must(pg.execInContainer("bash","-lc","rm -rf /tmp/exports && mkdir -p /tmp/exports"), "prep exports");
    for (MapTable t : TABLES) {
      String copy = """
          export PGPASSWORD='%s';
          psql -v ON_ERROR_STOP=1 -U %s -d %s -c "\\\\copy (SELECT row_to_json(x) FROM public.%s AS x) TO '/tmp/exports/%s.json'"
          """.formatted(pg.getPassword(), pg.getUsername(), pg.getDatabaseName(), t.pg(), t.mongo());
      must(pg.execInContainer("bash","-lc", copy), "export " + t.pg());
    }

    // rapatrier les JSON
    for (MapTable t : TABLES) {
      Path dest = DATA_DIR.resolve(t.mongo() + ".json");
      copyFromContainer(pg, "/tmp/exports/" + t.mongo() + ".json", dest);
    }
    log("Exports JSON écrits dans ./data");
  }

  // ----- Exécuter une liste de scripts mongosh -----
  static void runScripts(MongoDBContainer mongo, String[] scripts) throws Exception {
    for (String s : scripts) {
      Path local = SCRIPTS_DIR.resolve(s);
      if (Files.exists(local)) {
        log(">> [scripts] Copie : " + s);
        mongo.copyFileToContainer(MountableFile.forHostPath(local), "/scripts/" + s);

        log(">> [scripts] Exécution : " + s + " ...");
        var res = mongo.execInContainer("bash","-lc", "mongosh --quiet < \"/scripts/" + s + "\"");
        String out = stripMongoshPrompt(res.getStdout());
        if (!out.isBlank()) System.out.println(out.trim());
        must(res, s);
        log(">> [scripts] " + s + " : OK");
      } else {
        log("** Attention: script manquant, ignoré: " + s);
      }
    }
  }

  static void importIntoMongoAndRunScripts(MongoDBContainer mongo) throws Exception {
    // pousser JSON et scripts
    must(mongo.execInContainer("bash","-lc","mkdir -p /imports /scripts /csv"), "prep mongo dirs");

    // --- Import des collections sources ---
    for (MapTable t : TABLES) {
      Path src = DATA_DIR.resolve(t.mongo() + ".json");
      if (!Files.exists(src)) throw new IllegalStateException("Manque: " + src.toAbsolutePath());
      log(">> [import] " + t.mongo() + " ...");
      mongo.copyFileToContainer(MountableFile.forHostPath(src), "/imports/" + t.mongo() + ".json");

      String imp = """
          mongoimport --uri "mongodb://localhost:27017" --db tp2_ind500 \
            --collection "%s" --file "/imports/%s.json" --drop
          """.formatted(t.mongo(), t.mongo());
      must(mongo.execInContainer("bash","-lc", imp), "mongoimport " + t.mongo());
      log(">> [import] " + t.mongo() + " : OK");
    }

    // --- Phase 1 : build + normalisation + indexes ---
    log(">> Phase 1 : build-modeled + normalize + create-indexes");
    String[] phase1 = { "build-modeled.js", "normalize.js", "create-indexes.js" };
    runScripts(mongo, phase1);

    // --- Rapport juste après la création des indexes ---
    log(">> Rapport après create-indexes.js");
    writeReport(mongo);

    // --- Phase 2 : requêtes (all + advanced) ---
    log(">> Phase 2 : all-queries + advanced-queries");
    String[] phase2 = { "all-queries.js", "advanced-queries.js" };
    runScripts(mongo, phase2);

    // --- Export CSV automatique des résultats __csv_* ---
    log(">> Export CSV des résultats __csv_* vers ./artifacts/csv");
    exportCsvCollections(mongo);
  }

  // ===== Export CSV des résultats __csv_* =====
  static void exportCsvCollections(MongoDBContainer mongo) throws Exception {
    Files.createDirectories(ARTIFACTS_CSV);

    // Récupérer la liste des collections "__csv_*"
    String list = evalMongo(mongo, """
      (function(){
        return db.getCollectionInfos({ name: /^__csv_/ })
                 .map(c => c.name)
                 .join('\\n');
      })()
    """);

    List<String> colls = new ArrayList<>();
    for (String line : list.split("\\R")) {
      String s = line.trim();
      if (!s.isEmpty()) colls.add(s);
    }
    if (colls.isEmpty()) {
      log("   (aucune collection __csv_* à exporter)");
      return;
    }

    // Pour chaque collection, déterminer la liste de champs (hors _id),
    // exporter en CSV dans /csv côté conteneur, puis rapatrier dans ./artifacts/csv/
    for (String coll : colls) {
      String fields = evalMongo(mongo, """
        (function(){
          const d = db.getCollection("%s").findOne();
          if (!d) return "";
          return Object.keys(d).filter(k => k !== "_id").join(",");
        })()
      """.formatted(coll));
      // fallback si pas de doc : on exporte quand même (fichier vide)
      String base = coll.replaceAll("^__csv_",""); // nom plus compact côté host
      String containerOut = "/csv/" + base + ".csv";
      String hostOut = ARTIFACTS_CSV.resolve(base + ".csv").toString();

      String cmd;
      if (fields != null && !fields.isBlank()) {
        cmd = """
          mongoexport --uri "mongodb://localhost:27017" --db tp2_ind500 \
            --collection "%s" --type=csv --fields "%s" --out "%s"
        """.formatted(coll, fields.replace("\"","\\\""), containerOut);
      } else {
        // pas de champs -> on tente un export "vide" (créera un fichier sans lignes)
        cmd = """
          bash -lc 'true > "%s"'
        """.formatted(containerOut);
      }
      must(mongo.execInContainer("bash","-lc", cmd), "mongoexport " + coll);

      // rapatrier le fichier CSV
      copyFromContainer(mongo, containerOut, Path.of(hostOut));
      log("   - " + coll + " -> artifacts/csv/" + base + ".csv");
    }
  }

  // ===== Rapport lisible (aligné + index par puces) =====
  static void writeReport(MongoDBContainer mongo) throws Exception {
    // Comptes brutes formatées
    String countsBrutesFmt = evalMongo(mongo, """
      (function(){
        const d = {
          orders: db.orders.countDocuments(),
          customers: db.customers.countDocuments(),
          products: db.products.countDocuments(),
          product_category_name_translation: db.product_category_name_translation.countDocuments(),
          order_items: db.order_items.countDocuments(),
          order_payments: db.order_payments.countDocuments(),
          order_reviews: db.order_reviews.countDocuments(),
          sellers: db.sellers.countDocuments(),
          geolocation: db.geolocation.countDocuments(),
          leads_qualified: db.leads_qualified.countDocuments(),
          leads_closed: db.leads_closed.countDocuments()
        };
        const ks = Object.keys(d);
        const w  = Math.max(...ks.map(k => k.length));
        return ks.map(k => k.padEnd(w) + "  : " + (d[k] ?? 0).toLocaleString('fr-CA')).join("\\n");
      })()
    """);

    // Comptes modélisés formatés
    String countsModeleFmt = evalMongo(mongo, """
      (function(){
        const d = {
          tp2_orders: db.tp2_orders.countDocuments(),
          tp2_products: db.tp2_products.countDocuments(),
          tp2_sellers_geo: db.tp2_sellers_geo.countDocuments(),
          tp2_leads: db.tp2_leads.countDocuments()
        };
        const ks = Object.keys(d);
        const w  = Math.max(...ks.map(k => k.length));
        return ks.map(k => k.padEnd(w) + "  : " + (d[k] ?? 0).toLocaleString('fr-CA')).join("\\n");
      })()
    """);

    // Listes d’index jolies (4 collections)
    String idxOrdersFmt   = evalMongo(mongo, "db.tp2_orders.getIndexes().map(i => '  - ' + i.name).join('\\n')");
    String idxProductsFmt = evalMongo(mongo, "db.tp2_products.getIndexes().map(i => '  - ' + i.name).join('\\n')");
    String idxSellersFmt  = evalMongo(mongo, "db.tp2_sellers_geo.getIndexes().map(i => '  - ' + i.name).join('\\n')");
    String idxLeadsFmt    = evalMongo(mongo, "db.tp2_leads.getIndexes().map(i => '  - ' + i.name).join('\\n')");

    int port = mongo.getMappedPort(27017);
    String uri = "mongodb://127.0.0.1:"+port+"/tp2_ind500?directConnection=true";

    String report = """
        # Rapport harness (Java)
        Date: %s
        URI Compass: %s

        Counts (brutes) - après IMPORT:
        %s

        Counts (modélisées):
        %s

        Indexes:
        tp2_orders:
        %s

        tp2_products:
        %s

        tp2_sellers_geo:
        %s

        tp2_leads:
        %s
        """.formatted(LocalDateTime.now(), uri,
            countsBrutesFmt, countsModeleFmt,
            idxOrdersFmt, idxProductsFmt, idxSellersFmt, idxLeadsFmt);

    Files.writeString(ARTIFACTS.resolve("report.txt"), report);
    System.out.println("\n" + report);
  }

  // ---------- Helpers ----------

  // Filtre toutes les lignes de prompt mongosh type:
  // "docker-rs [direct: primary] dbname> ..."
  static String stripMongoshPrompt(String s) {
    if (s == null) return "";
    return s.replaceAll("(?m)^docker(?:-rs)? \\[[^\\]]+\\] .*?(\\r?\\n|$)", "");
  }

  // Nouvelle façon de rapatrier un fichier : InputStream -> fichier local
  static void copyFromContainer(ContainerState c, String srcInContainer, Path destOnHost)
      throws IOException, InterruptedException {
    Files.createDirectories(destOnHost.getParent());
    c.copyFileFromContainer(srcInContainer, is -> {
      Files.copy(is, destOnHost, StandardCopyOption.REPLACE_EXISTING);
      return null; // ThrowingFunction<T> doit retourner quelque chose
    });
  }

  static String evalMongo(MongoDBContainer mongo, String js) throws IOException, InterruptedException {
    var res = mongo.execInContainer("bash","-lc", "mongosh --quiet --eval \"" + js.replace("\"","\\\"") + "\" tp2_ind500");
    must(res, "mongosh eval");
    return stripMongoshPrompt(res.getStdout()).trim();
  }

  static void must(org.testcontainers.containers.Container.ExecResult r, String step) {
    if (r.getExitCode() != 0) {
      throw new RuntimeException("Échec " + step + ":\nSTDOUT:\n" + r.getStdout() + "\nSTDERR:\n" + r.getStderr());
    }
  }

  static void deleteRecursive(Path p) throws IOException {
    if (!Files.exists(p)) return;
    try (var s = Files.walk(p)) {
      s.sorted((a,b) -> b.getNameCount()-a.getNameCount())
       .forEach(path -> { try { Files.delete(path); } catch (IOException e) { throw new RuntimeException(e); }});
    }
  }

  static String pretty(String jsonOneLine) {
    // sans dépendance JSON: on laisse "plat"
    return jsonOneLine;
  }

  static void log(String m){
    System.out.println(m);
    System.out.flush(); // pour voir les étapes immédiatement
  }
}
