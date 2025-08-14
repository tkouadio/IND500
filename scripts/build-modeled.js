/****************************************************
 * IND500 TP2 – ÉTS Montréal
 * build-modeled.js
 *
 * Collections finales :
 *   • tp2_orders        – commandes + client(+Geo) + items[] + payments[] + review
 *   • tp2_products      – produit + traduction catégorie
 *   • tp2_sellers_geo   – vendeur + GeoJSON (+ has_geo)
 *   • tp2_leads         – leads qualifiés + closed emb + revenu mensuel estimé
 ****************************************************/

use('tp2_ind500');

function step(msg){ print(">>> " + msg); }

/* ───────── Collections cibles + index uniques ───────── */
step("Création collections cibles + index uniques");
db.createCollection('tp2_orders');      db.tp2_orders.createIndex({ order_id: 1 }, { unique: true });
db.createCollection('tp2_products');    db.tp2_products.createIndex({ product_id: 1 }, { unique: true });
db.createCollection('tp2_sellers_geo'); db.tp2_sellers_geo.createIndex({ seller_id: 1 }, { unique: true });
db.createCollection('tp2_leads');       db.tp2_leads.createIndex({ mql_id: 1 }, { unique: true });

/* ───────── Index de travail (sources) ───────── */
step("Index de travail sur sources");
db.orders.createIndex({ order_id: 1 });
db.order_items.createIndex({ order_id: 1 });
db.order_payments.createIndex({ order_id: 1 });
db.order_reviews.createIndex({ order_id: 1 });
db.products.createIndex({ product_id: 1 });
db.sellers.createIndex({ seller_id: 1 });
db.leads_closed.createIndex({ mql_id: 1 });
db.leads_qualified.createIndex({ mql_id: 1 });
db.geolocation.createIndex({ geolocation_zip_code_prefix: 1 });
db.customers.createIndex({ customer_id: 1 });
db.customers.createIndex({ customer_zip_code_prefix: 1 });

/******************************************************************************
 * TP2_ORDERS – commandes + client(+Geo) + items[] + payments[] + review
 *             + review norm + état client pérenne + DATES livraison
 ******************************************************************************/
step("Build tp2_orders …");
db.orders.aggregate([
  { $project: {
      _id: 0,
      order_id: 1,
      customer_id: 1,
      order_status: 1,
      order_purchase_timestamp: 1,
      order_approved_at: 1,
      order_delivered_carrier_date: 1,
      order_delivered_customer_date: 1,
      order_estimated_delivery_date: 1
  }},

 
  { $lookup: {
      from: 'customers',
      localField: 'customer_id',
      foreignField: 'customer_id',
      pipeline: [{ $project: {
        _id: 0,
        customer_id: 1,
        customer_unique_id: 1,
        customer_city_raw: 1,
        customer_state: 1,
        customer_zip_code_prefix: 1
      }}],
      as: 'cust_tmp'
  }},
  { $set: {
      customer: { $first: '$cust_tmp' },

      order_purchase_timestamp: {
        $convert: { input: '$order_purchase_timestamp', to: 'date', onError: null, onNull: null }
      },
      order_approved_at: {
        $convert: { input: '$order_approved_at', to: 'date', onError: null, onNull: null }
      },
      order_delivered_carrier_date: {
        $convert: { input: '$order_delivered_carrier_date', to: 'date', onError: null, onNull: null }
      },
      order_delivered_customer_date: {
        $convert: { input: '$order_delivered_customer_date', to: 'date', onError: null, onNull: null }
      },
      order_estimated_delivery_date: {
        $convert: { input: '$order_estimated_delivery_date', to: 'date', onError: null, onNull: null }
      }
  }},
  { $unset: 'cust_tmp' },
  { $set: { 'customer.customer_city_norm': '$customer.customer_city_raw' } },
  { $unset: 'customer.customer_city_raw' },

  { $lookup: {
      from: 'geolocation',
      localField: 'customer.customer_zip_code_prefix',
      foreignField: 'geolocation_zip_code_prefix',
      pipeline: [{ $project: {
        _id: 0, geolocation_zip_code_prefix: 1,
        geolocation_city: 1, geolocation_state: 1,
        geolocation_lat: 1, geolocation_lng: 1
      }}, { $limit: 1 }],
      as: 'geo_tmp'
  }},
  { $set: { 'customer.geo': { $first: '$geo_tmp' } } },
  { $unset: 'geo_tmp' },

  { $set: {
      'customer.customer_state': {
        $toUpper: { $ifNull: [ '$customer.customer_state', '$customer.geo.geolocation_state' ] }
      },
      'customer.customer_city_norm': {
        $ifNull: [ '$customer.customer_city_norm', '$customer.geo.geolocation_city' ]
      }
  }},

  { $set: {
      customer: {
        $let: {
          vars: { cg:'$customer', lat:'$customer.geo.geolocation_lat', lng:'$customer.geo.geolocation_lng' },
          in: { $mergeObjects: [
            '$$cg',
            {
              has_geo: { $and: [ { $isNumber: '$$lat' }, { $isNumber: '$$lng' } ] },
              geo: {
                $cond: [
                  { $and: [ { $isNumber: '$$lat' }, { $isNumber: '$$lng' } ] },
                  {
                    location: { type:'Point', coordinates:[ '$$lng','$$lat' ] },
                    geolocation_zip_code_prefix: '$$cg.geo.geolocation_zip_code_prefix',
                    geolocation_city:  '$$cg.geo.geolocation_city',
                    geolocation_state: '$$cg.geo.geolocation_state'
                  },
                  '$$REMOVE'
                ]
              }
            }
          ]}
        }
      }
  }},

  { $lookup:{ from:'order_items', localField:'order_id', foreignField:'order_id',
              pipeline:[{ $project:{ _id:0, order_id:1, product_id:1, seller_id:1, price:1, quantity:1, freight_value:1 }}],
              as:'items' } },
  { $lookup:{ from:'order_payments', localField:'order_id', foreignField:'order_id',
              pipeline:[{ $project:{ _id:0, order_id:1, payment_type:1, payment_installments:1, payment_value:1 }}],
              as:'payments' } },

  { $lookup:{ from:'order_reviews', localField:'order_id', foreignField:'order_id',
              pipeline:[{ $project:{
                _id:0, order_id:1, review_score:1,
                review_comment_message:1,
                review_comment_message_raw:1,
                review_creation_date:1
              }}],
              as:'reviews_t' } },
  { $set:{ review:{ $first:'$reviews_t' } } },
  { $unset:'reviews_t' },
  { $set: {
      'review.review_comment_message': {
        $ifNull: [ '$review.review_comment_message', '$review.review_comment_message_raw' ]
      },
      'review.review_comment_message_norm': {
        $ifNull: [
          '$review.review_comment_message_norm',
          { $ifNull: [ '$review.review_comment_message_raw', '$review.review_comment_message' ] }
        ]
      }
  }},
  { $unset: 'review.review_comment_message_raw' },

  { $unset:[
      'customer_id',
      'customer._id',
      'customer.customer_id',
      'customer.customer_zip_code_prefix',
      'customer.geo._id'
  ]},

  
  { $merge:{ into:'tp2_orders', on:'order_id', whenMatched:'replace', whenNotMatched:'insert' } }
], { allowDiskUse: true });
print('OK : tp2_orders générée');

/* Index utiles (après merge) */
db.tp2_orders.createIndex({ order_purchase_timestamp: 1 });
db.tp2_orders.createIndex({ order_delivered_carrier_date: 1 });
db.tp2_orders.createIndex({ order_delivered_customer_date: 1 });
db.tp2_orders.createIndex({ "items.seller_id": 1, order_purchase_timestamp: 1 });
db.tp2_orders.createIndex({ "review.review_comment_message": "text" });
db.tp2_orders.createIndex({ "customer.customer_state": 1, order_purchase_timestamp: 1 });

/****************************************************
 * TP2_PRODUCTS – produit + traduction catégorie
 ****************************************************/
step("Build tp2_products …");
db.products.aggregate([
  { $project: { _id:0, product_id:1, product_category_name:1 } },
  { $lookup:{
      from:'product_category_name_translation',
      localField:'product_category_name',
      foreignField:'product_category_name',
      pipeline:[ { $project: { _id:0, product_category_name_english:1 } } ],
      as:'cat'
  }},
  { $set:{ category:{ $first:'$cat.product_category_name_english' } } },
  { $unset:'cat' },
  { $merge:{ into:'tp2_products', on:'product_id', whenMatched:'replace', whenNotMatched:'insert' } }
], { allowDiskUse: true });
print('OK : tp2_products générée');

/****************************************************
 * TP2_SELLERS_GEO – vendeur + GeoJSON + has_geo
 ****************************************************/
step("Build tp2_sellers_geo …");
db.sellers.aggregate([
  { $project: { _id:0, seller_id:1, seller_city_raw:1, seller_zip_code_prefix:1 } },
  { $lookup: {
      from: 'geolocation',
      localField: 'seller_zip_code_prefix',
      foreignField: 'geolocation_zip_code_prefix',
      pipeline: [
        { $project: { _id:0, geolocation_zip_code_prefix:1, geolocation_city:1, geolocation_state:1, geolocation_lat:1, geolocation_lng:1 } },
        { $limit: 1 }
      ],
      as: 'geo_tmp'
  }},
  { $set: { geo: { $first: '$geo_tmp' }, seller_city_norm: '$seller_city_raw' } },
  { $unset: ['geo_tmp', 'seller_city_raw'] },
  { $set: {
      has_geo: { $and: [ { $isNumber: '$geo.geolocation_lat' }, { $isNumber: '$geo.geolocation_lng' } ] },
      geo: {
        $cond: [
          { $and: [ { $isNumber: '$geo.geolocation_lat' }, { $isNumber: '$geo.geolocation_lng' } ] },
          {
            location: { type: 'Point', coordinates: [ '$geo.geolocation_lng', '$geo.geolocation_lat' ] },
            geolocation_zip_code_prefix: '$geo.geolocation_zip_code_prefix',
            geolocation_city:  '$geo.geolocation_city',
            geolocation_state: '$geo.geolocation_state'
          },
          '$$REMOVE'
        ]
      }
  }},
  { $merge: { into: 'tp2_sellers_geo', on: 'seller_id', whenMatched: 'replace', whenNotMatched: 'insert' } }
], { allowDiskUse: true });
print('OK : tp2_sellers_geo générée');

/****************************************************************
 * TP2_LEADS – leads qualifiés + closed emb (+ enrichissement)
 ****************************************************************/
step("Build tp2_leads (closed emb) …");
db.leads_qualified.aggregate([
  { $project: { _id:0, mql_id:1, first_contact_date:1, origin:1 } },
  { $lookup:{
      from:'leads_closed',
      localField:'mql_id',
      foreignField:'mql_id',
      pipeline:[ { $project:{ _id:0, mql_id:1, seller_id:1, won_date:1, business_segment:1, lead_type:1, declared_monthly_revenue:1 } } ],
      as:'closed'
  }},
  { $addFields: { leads_closed_emb: { $first: '$closed' } } },
  { $unset: [ 'closed', 'leads_closed_emb.mql_id' ] },
  { $merge:{ into:'tp2_leads', on:'mql_id', whenMatched:'replace', whenNotMatched:'insert' } }
], { allowDiskUse: true });
print('OK : tp2_leads (closed emb)');

step("Enrichissement tp2_leads (est_monthly_income, income_best) …");
db.tp2_leads.aggregate([
  { $addFields: {
      wonDate: { $convert: { input: '$leads_closed_emb.won_date', to: 'date', onError: null, onNull: null } },
      declared_monthly_revenue_num: { $convert: { input: '$leads_closed_emb.declared_monthly_revenue', to: 'double', onError: null, onNull: null } }
  }},
  { $addFields: { wonEnd: { $dateAdd: { startDate: '$wonDate', unit: 'day', amount: 30 } } } },
  { $lookup: {
      from: 'tp2_orders',
      let: { sid: '$leads_closed_emb.seller_id', start: '$wonDate', end: '$wonEnd' },
      pipeline: [
        { $match: { $expr: { $and: [
          { $gte: [ '$order_purchase_timestamp', '$$start' ] },
          { $lt:  [ '$order_purchase_timestamp', '$$end'   ] }
        ]}}},
        { $project: { _id:0, order_purchase_timestamp:1, items:1 } },
        { $unwind: '$items' },
        { $match: { $expr: { $eq: [ '$items.seller_id', '$$sid' ] } } },
        { $group: { _id: null, revenue_30d: {
          $sum: { $multiply: [ '$items.price', { $ifNull: [ '$items.quantity', 1 ] } ] }
        }}}
      ],
      as: 'rev30'
  }},
  { $addFields: { est_monthly_income: { $first: '$rev30.revenue_30d' } } },
  { $unset: 'rev30' },
  { $addFields: {
      income_best: {
        $cond: [
          { $gt: [ '$declared_monthly_revenue_num', 0 ] },
          '$declared_monthly_revenue_num',
          { $cond: [ { $gt: [ '$est_monthly_income', 0 ] }, '$est_monthly_income', null ] }
        ]
      }
  }},
  { $merge: { into: 'tp2_leads', on: 'mql_id', whenMatched: 'merge', whenNotMatched: 'insert' } }
], { allowDiskUse: true });
print('OK : tp2_leads enrichi');

/* ───────── Récapitulatif ───────── */
print('--- Récapitulatif ---');
[ 'tp2_orders','tp2_products','tp2_sellers_geo','tp2_leads' ]
  .forEach(c => print(`${c} : ${db[c].countDocuments()} docs`));

print('tp2_orders sans customer_state : ' +
  db.tp2_orders.countDocuments({ 'customer.customer_state': { $in: [null, '', undefined] } }));
