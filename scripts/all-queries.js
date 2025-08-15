/*********************************************************
 * IND500 — TP2 ÉTS Montréal
 * all-queries.js — Groupes A (Q1-A → Q5-A) & B (Q1-B → Q5-B)
 * Sources: collections modélisées tp2_orders, tp2_products
 *********************************************************/

use('tp2_ind500');

/* ===== Helpers d’affichage (50 lignes + … + total) + export CSV ===== */
function asNum(v){ try{ return v==null ? null : Number(v); }catch{ return null; } }
function n0(v){ const x=asNum(v); return Number.isFinite(x) ? x.toLocaleString('fr-CA') : ''; }
function n2(v){ const x=asNum(v); return Number.isFinite(x) ? x.toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''; }
function pad(s,w){ s=String(s??''); return s + ' '.repeat(Math.max(0, w - s.length)); }

const EXPORT_TO_TMP_COLLECTION = true;
function slugify(title){
  return String(title||'result')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function exportCsvToTempCollection(title, data, cols){
  try{
    const coll = "__csv_" + slugify(title);
    const fields = cols.map(c => c.k);
    const docs = data.map(r => {
      const o = {};
      fields.forEach(k => o[k] = r?.[k]);
      return o;
    });
    const c = db.getCollection(coll);
    c.deleteMany({});
    if (docs.length) c.insertMany(docs);
    print(`(csv prêt : ${coll} : ${docs.length} lignes)`);
  }catch(e){ print("(export csv) " + e.message); }
}


function printTable(rows, cols, a3, a4){
  let limit = null, title = '';
  if (typeof a3 === 'number'){ limit = a3; title = a4 || ''; }
  else { title = a3 || ''; }

  const all = Array.isArray(rows) ? rows : rows.toArray();
  if (title) print("\n=== " + title + " ===");
  if (!all.length){ print("(aucun résultat)"); return 0; }

  if (EXPORT_TO_TMP_COLLECTION && title) exportCsvToTempCollection(title, all, cols);

  const MAX_SHOW = 50;
  const showCap  = limit != null ? Math.min(limit, MAX_SHOW) : MAX_SHOW;
  const showN    = Math.min(all.length, showCap);

  const widths = cols.map(c => Math.max(
    (c.title||c.k).length,
    ...all.slice(0, showN).map(r => String((c.f ? c.f(r[c.k], r) : r[c.k]) ?? '').length)
  ));

  print(cols.map((c,i)=>pad(c.title||c.k, widths[i])).join(' │ '));
  print(widths.map(w=>'─'.repeat(w)).join('─┼─'));

  for (let i=0; i<showN; i++){
    const r = all[i];
    const line = cols.map((c,i)=>pad((c.f ? c.f(r[c.k], r) : (r[c.k]??'')), widths[i])).join(' │ ');
    print(line);
  }

  if (all.length > MAX_SHOW){
    const dots = cols.map((_,i)=>pad('...', widths[i])).join(' │ ');
    print(dots); print(dots); print(dots);
    //print(`(${all.length} lignes au total)`);
  }
  return all.length;
}
function safe(title, fn){ try{ fn(); } catch(e){ print(title + " : " + e.message); } }

/* =========================================================
 * ======  GROUPE A  ======
 * =======================================================*/

/* =========================================================
 * Q1-A : Nombre de commandes par état (customer_state)
 * ------------------------------------------------------- */
safe("Q1-A", () => {
  const res = db.tp2_orders.aggregate([
    { $addFields: {
        _state: { $toUpper: { $ifNull: ["$customer.customer_state", "$customer.geo.geolocation_state"] } }
    }},
    { $match: { _state: { $nin: [null, ""] } } },
    { $group: { _id: "$_state", nb: { $sum: 1 } } },
    { $project: { _id: 0, customer_state: "$_id", nb: 1 } },
    { $sort: { customer_state: 1 } }
  ]).toArray();

  const n = printTable(res, [
    { k:'customer_state', title:'état' },
    { k:'nb',             title:'commandes', f:n0 }
  ], "Q1-A : commandes par état");
  print(`\n(${n} lignes)`);
});

/* =========================================================
 * Q2-A : Top 10 commandes (prix + livraison)
 * ------------------------------------------------------- */
safe("Q2-A", () => {
  const res = db.tp2_orders.aggregate([
    { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
    { $project: {
        order_id: 1,
        line_total: {
          $add: [
            { $convert: { input: "$items.price",         to: "double", onError: 0, onNull: 0 } },
            { $convert: { input: "$items.freight_value", to: "double", onError: 0, onNull: 0 } }
          ]
        }
    }},
    { $group: { _id: "$order_id", total: { $sum: "$line_total" } } },
    { $project: { _id: 0, order_id: "$_id", total: { $round: ["$total", 2] } } },
    { $sort: { total: -1 } },
    { $limit: 10 }
  ]).toArray();

  const n = printTable(res, [
    { k:'order_id', title:'commande' },
    { k:'total',    title:'montant', f:n2 }
  ], "Q2-A : top 10 commandes");
  print(`\n(${n} lignes)`);
});

/* =========================================================
 * Q3-A : Top 10 vendeurs par CA (prix + livraison)
 * ------------------------------------------------------- */
safe("Q3-A", () => {
  const res = db.tp2_orders.aggregate([
    { $unwind: "$items" },
    { $project: {
        seller_id: "$items.seller_id",
        line_total: {
          $add: [
            { $convert: { input: "$items.price",         to: "double", onError: 0, onNull: 0 } },
            { $convert: { input: "$items.freight_value", to: "double", onError: 0, onNull: 0 } }
          ]
        }
    }},
    { $group: { _id: "$seller_id", total: { $sum: "$line_total" } } },
    { $project: { _id: 0, seller_id: "$_id", total: { $round: [ "$total", 2 ] } } },
    { $sort: { total: -1 } },
    { $limit: 10 }
  ]).toArray();

  const n = printTable(res, [
    { k:'seller_id', title:'vendeur' },
    { k:'total',     title:'CA total', f:n2 }
  ], "Q3-A : top 10 vendeurs par CA");
  print(`\n(${n} lignes)`);
});

/* =========================================================
 * Q4-A : Dépense mensuelle par ÉTAT + cumul
 * ------------------------------------------------------- */
safe("Q4-A", () => {
  const res = db.tp2_orders.aggregate([
    { $addFields: {
        _d: { $convert: { input: "$order_purchase_timestamp", to: "date", onError: null, onNull: null } },
        _state: { $toUpper: { $ifNull: ["$customer.customer_state", "$customer.geo.geolocation_state"] } }
    }},
    { $match: { _d: { $ne: null }, _state: { $nin: [null, ""] } } },
    { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
    { $addFields: {
        _month: { $dateTrunc: { date: "$_d", unit: "month" } },
        _line:  { $add: [
                   { $convert: { input: "$items.price",         to: "double", onError: 0, onNull: 0 } },
                   { $convert: { input: "$items.freight_value", to: "double", onError: 0, onNull: 0 } }
                 ] }
    }},
    { $group: { _id: { state: "$_state", month: "$_month" }, total: { $sum: "$_line" } } },
    { $sort:  { "_id.state": 1, "_id.month": 1 } },
    { $setWindowFields: {
        partitionBy: "$_id.state",
        sortBy: { "_id.month": 1 },
        output: { cum_total: { $sum: "$total", window: { documents: ["unbounded", "current"] } } }
    }},
    { $project: {
        _id: 0,
        Etat: "$_id.state",
        Mois: { $dateToString: { format: "%Y-%m", date: "$_id.month" } },
        Depense: { $round: ["$total", 2] },
        Cumul:   { $round: ["$cum_total", 2] }
    }},
    { $sort: { Etat: 1, Mois: 1 } }
  ]).toArray();

  const n = printTable(res, [
    { k:'Etat',    title:'État' },
    { k:'Mois',    title:'Mois' },
    { k:'Depense', title:'Dépense', f:n2 },
    { k:'Cumul',   title:'Cumul',   f:n2 }
  ], "Q4-A : Dépense mensuelle par état (avec cumul)");
  print(`\n(${n} lignes)`);
});

/* =========================================================
 * Q5-A : CA mensuel par catégorie + % d’évolution (m / m-1)
 * ------------------------------------------------------- */
safe("Q5-A", () => {
  const res = db.tp2_orders.aggregate([
    { $addFields: { _d: { $convert: { input: "$order_purchase_timestamp", to: "date", onError: null, onNull: null } } } },
    { $match: { _d: { $ne: null } } },
    { $unwind: "$items" },
    { $lookup: {
        from: "tp2_products",
        localField: "items.product_id",
        foreignField: "product_id",
        as: "p"
    }},
    { $set: { p: { $first: "$p" } } },
    { $project: {
        cat: "$p.product_category_name",
        m:   { $dateTrunc: { date: "$_d", unit: "month" } },
        line_total: {
          $add: [
            { $convert: { input: "$items.price",         to: "double", onError: 0, onNull: 0 } },
            { $convert: { input: "$items.freight_value", to: "double", onError: 0, onNull: 0 } }
          ]
        }
    }},
    { $group: { _id: { cat: "$cat", m: "$m" }, total: { $sum: "$line_total" } } },
    { $sort: { "_id.cat": 1, "_id.m": 1 } },
    { $setWindowFields: {
        partitionBy: "$_id.cat",
        sortBy: { "_id.m": 1 },
        output: { prev_total: { $shift: { output: "$total", by: 1, default: null } } }
    }},
    { $project: { _id: 0,
        product_category_name: "$_id.cat",
        sale_month: { $dateToString: { format: "%Y-%m", date: "$_id.m" } },
        total: { $round: ["$total", 2] },
        prev_total: { $round: ["$prev_total", 2] },
        pct_change_vs_prev: {
          $cond: [
            { $gt: ["$prev_total", 0] },
            { $multiply: [ { $divide: [ { $subtract: ["$total", "$prev_total"] }, "$prev_total" ] }, 100 ] },
            null
          ]
        }
    }},
    { $project: { product_category_name: 1, sale_month: 1, total: 1, prev_total: 1,
                  pct_change_vs_prev: { $round: ["$pct_change_vs_prev", 2] } } },
    { $sort: { product_category_name: 1, sale_month: 1 } }
  ]).toArray();

  const n = printTable(res, [
    { k:'product_category_name', title:'catégorie' },
    { k:'sale_month',            title:'mois' },
    { k:'total',                 title:'total',  f:n2 },
    { k:'prev_total',            title:'mois-1', f:n2 },
    { k:'pct_change_vs_prev',    title:'évo % m/m-1', f:n2 }
  ], "Q5-A : CA mensuel par catégorie + évolution (%)");
  print(`\n(${n} lignes)`);
});

/* =========================================================
 * ======  GROUPE B  ======
 * =======================================================*/

/* Q1-B : Nombre de clients réels par état (distinct customer_unique_id) */
safe("Q1-B", () => {
  const res = db.tp2_orders.aggregate([
    { $addFields: {
        _state: { $toUpper: { $ifNull: ["$customer.customer_state", "$customer.geo.geolocation_state"] } },
        _uid: "$customer.customer_unique_id"
    }},
    { $match: { _state: { $nin: [null, ""] }, _uid: { $ne: null } } },
    { $group: { _id: { state: "$_state", uid: "$_uid" } } },
    { $group: { _id: "$_id.state", nb_clients: { $sum: 1 } } },
    { $project: { _id: 0, customer_state: "$_id", nb_clients: 1 } },
    { $sort: { customer_state: 1 } }
  ]).toArray();

  const n = printTable(res, [
    { k:'customer_state', title:'état' },
    { k:'nb_clients',     title:'clients réels', f:n0 }
  ], "Q1-B : clients réels par état");
  print(`\n(${n} lignes)`);
});

/* Q2-B : Nombre moyen de lignes de commande par commande */
safe("Q2-B", () => {
  const res = db.tp2_orders.aggregate([
    { $project: { _id: 0, lines: { $size: { $ifNull: ["$items", []] } } } },
    { $group:   { _id: null, avg_lines: { $avg: "$lines" }, nb_orders: { $sum: 1 } } },
    { $project: { _id: 0, avg_lines: { $round: ["$avg_lines", 2] }, nb_orders: 1 } }
  ]).toArray();

  const n = printTable(res, [
    { k:'avg_lines', title:'moyenne lignes/commande', f:n2 },
    { k:'nb_orders', title:'# commandes', f:n0 }
  ], "Q2-B : nombre moyen de lignes par commande");
  print(`\n(${n} lignes)`);
});

/* Q3-B : Top 5 catégories par NOMBRE DE COMMANDES distinctes */
safe("Q3-B", () => {
  const res = db.tp2_orders.aggregate([
    { $unwind: "$items" },
    { $lookup: {
        from: "tp2_products",
        localField: "items.product_id",
        foreignField: "product_id",
        as: "p"
    }},
    { $set: { p: { $first: "$p" } } },
    { $group: { _id: { cat: "$p.product_category_name", oid: "$order_id" } } },
    { $group: { _id: "$_id.cat", num_orders: { $sum: 1 } } },
    { $project: { _id: 0, product_category_name: "$_id", num_orders: 1 } },
    { $sort: { num_orders: -1, product_category_name: 1 } },
    { $limit: 5 }
  ]).toArray();

  const n = printTable(res, [
    { k:'product_category_name', title:'catégorie' },
    { k:'num_orders',            title:'# commandes', f:n0 }
  ], "Q3-B : top 5 catégories par nombre de commandes");
  print(`\n(${n} lignes)`);
});

/* Q4-B : Répartition des ventes par vendeur (+ % et cumul %) */
safe("Q4-B", () => {
  const res = db.tp2_orders.aggregate([
    { $unwind: "$items" },
    { $project: {
        seller_id: "$items.seller_id",
        revenue: {
          $add: [
            { $convert: { input: "$items.price",         to: "double", onError: 0, onNull: 0 } },
            { $convert: { input: "$items.freight_value", to: "double", onError: 0, onNull: 0 } }
          ]
        }
    }},
    { $group: { _id: "$seller_id", revenue: { $sum: "$revenue" } } },
    { $project: { _id: 0, seller_id: "$_id", revenue: 1 } },
    { $sort: { revenue: -1 } },
    { $setWindowFields: {
        sortBy: { revenue: -1 },
        output: {
          grand_total: { $sum: "$revenue", window: { documents: ["unbounded", "unbounded"] } },
          cum_revenue: { $sum: "$revenue", window: { documents: ["unbounded", "current"] } }
        }
    }},
    { $project: {
        seller_id: 1,
        revenue:   { $round: ["$revenue", 2] },
        pourc:     { $round: [ { $divide: ["$revenue", "$grand_total"] }, 4 ] },
        pourc_cumm:{ $round: [ { $divide: ["$cum_revenue", "$grand_total"] }, 4 ] }
    }}
  ]).toArray();

  const n = printTable(res, [
    { k:'seller_id',  title:'vendeur' },
    { k:'revenue',    title:'ventes', f:n2 },
    { k:'pourc',      title:'pourc' },
    { k:'pourc_cumm', title:'pourc_cumm' }
  ], "Q4-B : répartition des ventes par vendeur (%, cumul)");
  print(`\n(${n} lignes)`);
});

/* Q5-B : Médiane du délai (carrier → client) par état*/
safe("Q5-B", () => {
  const res = db.tp2_orders.aggregate([
    { $addFields: {
        state: { $toUpper: { $ifNull: ["$customer.customer_state", "$customer.geo.geolocation_state"] } },
        d_carrier: { $convert: { input: "$order_delivered_carrier_date",  to: "date", onError: null, onNull: null } },
        d_client:  { $convert: { input: "$order_delivered_customer_date", to: "date", onError: null, onNull: null } }
    }},
    { $match: { state: { $nin: [null, ""] }, d_carrier: { $ne: null }, d_client: { $ne: null } } },
    { $addFields: {
        diff_hours: { $dateDiff: { startDate: "$d_carrier", endDate: "$d_client", unit: "hour" } }
    }},
    { $match: { diff_hours: { $gte: 0 } } },
    { $addFields: { diff_days: { $divide: ["$diff_hours", 24] } } },
    { $sort: { state: 1, diff_days: 1 } },
    { $group: { _id: "$state", vals: { $push: "$diff_days" }, n: { $sum: 1 } } },
    { $project: {
        _id: 0, customer_state: "$_id", n: 1,
        median_days: {
          $let: {
            vars: { n: "$n", midIdx: { $toInt: { $floor: { $divide: ["$n", 2] } } },
                    hiIdx:  { $toInt: { $divide: ["$n", 2] } } },
            in: {
              $cond: [
                { $eq: [{ $mod: ["$$n", 2] }, 1] },
                { $arrayElemAt: ["$vals", "$$midIdx"] },
                { $avg: [
                    { $arrayElemAt: ["$vals", { $subtract: ["$$hiIdx", 1] }] },
                    { $arrayElemAt: ["$vals", "$$hiIdx"] }
                  ] }
              ]
            }
          }
        }
    }},
    { $project: { customer_state:1, n:1, median_days: { $round: ["$median_days", 2] } } },
    { $sort: { customer_state: 1 } }
  ]).toArray();

  const n = printTable(res, [
    { k:'customer_state', title:'état' },
    { k:'median_days',    title:'médiane (jours)', f:n2 },
    { k:'n',              title:'# livraisons', f:n0 }
  ], "Q5-B : médiane délai transport (carrier - client) par état");
  print(`\n(${n} lignes)`);
});

print("\nOK : all-queries.js (Groupes A & B) exécuté.");
