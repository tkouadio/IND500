/*********************************************************
 * IND500 — TP2
 * advanced-queries.js (avec limites paramétrables)
 * Requêtes avancées sur les collections modélisées.
 * Collections : tp2_orders, tp2_leads
 *********************************************************/

use('tp2_ind500');

/* ===== Helpers d’affichage + export CSV ===== */
function asNum(v){ try{ return v==null ? null : Number(v.valueOf ? v.valueOf() : v); }catch{ return null; } }
function n0(v){ const x=asNum(v); return Number.isFinite(x) ? x.toLocaleString('fr-CA') : ''; }
function n2(v){ const x=asNum(v); return Number.isFinite(x) ? x.toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''; }
function n3(v){ const x=asNum(v); return Number.isFinite(x) ? x.toLocaleString('fr-CA',{minimumFractionDigits:3,maximumFractionDigits:3}) : ''; }
function fmtScore(v){ const x=asNum(v); return Number.isFinite(x) ? x.toFixed(2) : ''; }
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
      const o = {}; fields.forEach(k => o[k] = r?.[k]); return o;
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

  for (let i=0;i<showN;i++){
    const r = all[i];
    const line = cols.map((c,i)=>pad((c.f ? c.f(r[c.k],r) : (r[c.k]??'')), widths[i])).join(' │ ');
    print(line);
  }

  if (all.length > MAX_SHOW){
    const dots = cols.map((_,i)=>pad('...', widths[i])).join(' │ ');
    print(dots); print(dots); print(dots);
    print(`(${all.length} lignes au total)`);
  }
  return all.length;
}

function safe(title, fn){ try{ fn(); } catch(e){ print(title + " : " + e.message); } }

/* =========================================================
 * 1) $geoNear : clients (1 par localisation) à moins de 10 km
 * ======================================================= */
safe("1) Clients à moins de 10 km", () => {
  const POINT = { type: "Point", coordinates: [ -46.57421, -21.785741 ] };
  const RADIUS_M = 10_000;

  const nearPerLoc = db.tp2_orders.aggregate([
    { $geoNear: {
        near: POINT,
        key: "customer.geo.location",
        distanceField: "dist_m",
        maxDistance: RADIUS_M,
        spherical: true
    }},
    { $group: {
        _id: "$customer.geo.location",
        dist_m: { $min: "$dist_m" },
        sample_customer: { $first: "$customer.customer_unique_id" },
        last_order_id: { $first: "$order_id" }
    }},
    { $project: {
        _id: 0,
        customer: "$sample_customer",
        last_order_id: 1,
        dist_km: { $round: [ { $divide: ["$dist_m", 1000] }, 3 ] }
    }},
    { $sort: { dist_km: 1 } },
    { $limit: 10 }
  ]).toArray();

  printTable(nearPerLoc, [
    { k:'customer',      title:'client' },
    { k:'last_order_id', title:'dernière commande' },
    { k:'dist_km',       title:'distance (km)', f: n3 }
  ], 10, "1) Clients à moins de 10 km");
});

/* =========================================================
 * 2) $text : recherche défauts/retards (avec fallback regex)
 * ======================================================= */
safe('2) Recherche texte ("Produit defectueux" OU "Retard de livraison")', () => {
  const SEARCH =
    '"Produit defectueux" "Produit défectueux" "Retard de livraison" defectueux défectueux retard livraison';

  let res = db.tp2_orders.aggregate([
    { $match: { $text: { $search: SEARCH } } },
    { $project: {
        _id: 0,
        order_id: 1,
        pertinence: { $meta: "textScore" },
        score: "$review.review_score",
        extrait: { $substrCP: [ "$review.review_comment_message", 0, 120 ] }
    }},
    { $sort: { pertinence: -1 } },
    { $limit: 10 }
  ]).toArray();

  if (!res.length) {
    const RX = /(produit\s+d[eé]fectueux|retard\s+de\s+livraison)/i;
    res = db.tp2_orders.aggregate([
      { $match: {
          $or: [
            { "review.review_comment_message": { $regex: RX } },
            { "review.review_comment_message_norm": { $regex: RX } }
          ]
      }},
      { $project: {
          _id:0, order_id:1, pertinence: null,
          score: "$review.review_score",
          extrait: { $substrCP: [ "$review.review_comment_message", 0, 120 ] }
      }},
      { $limit: 10 }
    ]).toArray();
  }

  printTable(res, [
    { k:'order_id',   title:'commande' },
    { k:'score',      title:'score' },
    { k:'extrait',    title:'extrait' }
  ], 10, '2) Recherche texte ("Produit defectueux" OU "Retard de livraison")');
});

/* =========================================================
 * 3) $bucket : délai de conversion des leads (jours)
 * ======================================================= */
safe('3) Leads par délai de conversion (jours)', () => {
  const res = db.tp2_leads.aggregate([
    { $addFields: {
        cdate: { $convert: { input: "$first_contact_date", to: "date", onError: null, onNull: null } },
        wdate: { $convert: { input: "$leads_closed_emb.won_date", to: "date", onError: null, onNull: null } }
    }},
    { $match: { cdate: { $ne: null }, wdate: { $ne: null } }},
    { $addFields: {
        days_to_win: { $dateDiff: { startDate: "$cdate", endDate: "$wdate", unit: "day" } }
    }},
    { $bucket: {
        groupBy: "$days_to_win",
        boundaries: [0, 7, 30, 90],
        default: 1000000,
        output: { leads: { $sum: 1 } }
    }},
    { $addFields: {
        rank: {
          $switch: {
            branches: [
              { case: { $lt: ["$_id", 7]  }, then: 1 },
              { case: { $lt: ["$_id", 30] }, then: 2 },
              { case: { $lt: ["$_id", 90] }, then: 3 }
            ],
            default: 4
          }
        },
        tranche: {
          $switch: {
            branches: [
              { case: { $lt: ["$_id", 7]  }, then: "0 - 7 jours"  },
              { case: { $lt: ["$_id", 30] }, then: "8 - 30 jours" },
              { case: { $lt: ["$_id", 90] }, then: "31 - 90 jours"}
            ],
            default: " > 90 jours"
          }
        }
    }},
    { $project: { _id:0, tranche:1, leads:1, rank:1 } },
    { $sort: { rank: 1 } }
  ]).toArray();

  printTable(res, [
    { k: 'tranche', title: 'tranche' },
    { k: 'leads',   title: 'effectif', f: n0 }
  ], 20, '3) Leads par tranches de délai de conversion');
});

/* =========================================================
 * 4) $facet : top 5 produits & vendeurs par CA (price+freight)
 * ======================================================= */
safe('4) Top 5 produits / vendeurs par CA', () => {
  const out = db.tp2_orders.aggregate([
    { $unwind: "$items" },
    { $set: {
        product_id: "$items.product_id",
        seller_id:  "$items.seller_id",
        line_totalD:{ $add: [ { $toDecimal: { $ifNull: [ "$items.price", 0 ] } },
                              { $toDecimal: { $ifNull: [ "$items.freight_value", 0 ] } } ] }
    }},
    { $facet: {
        top_products: [
          { $group: { _id: "$product_id", revenueD: { $sum: "$line_totalD" } } },
          { $project: { _id:0, product_id:"$_id", revenu: { $round: [ { $toDouble: "$revenueD" }, 2 ] } } },
          { $sort: { revenu: -1 } },
          { $limit: 5 }
        ],
        top_sellers: [
          { $group: { _id: "$seller_id", revenueD: { $sum: "$line_totalD" } } },
          { $project: { _id:0, seller_id:"$_id", revenu: { $round: [ { $toDouble: "$revenueD" }, 2 ] } } },
          { $sort: { revenu: -1 } },
          { $limit: 5 }
        ]
      }
    }
  ]).toArray()[0] || { top_products:[], top_sellers:[] };

  printTable(out.top_products, [
    { k:'product_id', title:'produit' },
    { k:'revenu',     title:'revenu', f:n2 }
  ], 5, '4a) Top 5 produits par CA');

  printTable(out.top_sellers, [
    { k:'seller_id', title:'vendeur' },
    { k:'revenu',    title:'revenu', f:n2 }
  ], 5, '4b) Top 5 vendeurs par CA');
});

print("\nOK : advanced-queries.js exécuté.");
