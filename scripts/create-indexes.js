/*******************************************************
 * IND500 TP2 – ÉTS Montréal
 * create-indexes.js
 * Indexes analytiques : date d’achat, texte, géospatial
 *******************************************************/

use('tp2_ind500');

print('> Indexes tp2_orders ...');
db.tp2_orders.createIndex({ order_id: 1 }, { unique: true });
db.tp2_orders.createIndex({ order_purchase_timestamp: 1 });
db.tp2_orders.createIndex({ "review.review_comment_message": "text" });
db.tp2_orders.createIndex({ "customer.customer_unique_id": 1 });
db.tp2_orders.createIndex({ 'customer.geo.location': '2dsphere' });
db.tp2_orders.createIndex({ "customer.geo.geolocation_state": 1, order_purchase_timestamp: 1 });
db.tp2_orders.createIndex({ "items.seller_id": 1, order_purchase_timestamp: 1 });

print('> Indexes tp2_products ...');
db.tp2_products.createIndex({ product_id: 1 }, { unique: true });

print('> Indexes tp2_sellers_geo ...');
db.tp2_sellers_geo.createIndex({ seller_id: 1 }, { unique: true });
db.tp2_sellers_geo.createIndex({ "geo.location": "2dsphere" });

print('> Indexes tp2_leads ...');
db.tp2_leads.createIndex({ mql_id: 1 }, { unique: true });
db.tp2_leads.createIndex({ first_contact_date: 1 });
db.tp2_leads.createIndex({ "leads_closed_emb.won_date": 1 });


print('OK : Indexes collections TP2 créés');
