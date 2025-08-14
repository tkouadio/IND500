/************************************************************************************************
 * IND500 TP2 – ÉTS Montréal
 * normalize.js
 *
 * Nettoyage des champs suffixés _norm dans les collections modélisées :
 *   • tp2_orders.customer.customer_city_norm
 *   • tp2_orders.review.review_comment_message_norm
 *   • tp2_sellers_geo.seller_city_norm
 *
 *   Nettoyage : minuscules, sans accents, sans symboles.
 ************************************************************************************************/

use('tp2_ind500');

/* ------------ Règles de normalisation ------------ */
const rules = [
  { col: 'tp2_orders',      field: 'customer.customer_city_norm' },
  { col: 'tp2_sellers_geo', field: 'seller_city_norm' },
  { col: 'tp2_orders',      field: 'review.review_comment_message_norm' }
];


const accentMap = {
  'á':'a','à':'a','â':'a','ä':'a','ã':'a','å':'a',
  'é':'e','è':'e','ê':'e','ë':'e',
  'í':'i','ì':'i','î':'i','ï':'i',
  'ó':'o','ò':'o','ô':'o','ö':'o','õ':'o',
  'ú':'u','ù':'u','û':'u','ü':'u',
  'ç':'c','ñ':'n','ý':'y','ÿ':'y'
};


rules.forEach(({ col, field }) => {
  print(`\nNormalisation ${col}.${field}`);

  db[col].updateMany(
    { [field]: { $type: 'string', $ne: null } },
    [
      
      { $set: { __src: { $toString: `$${field}` } } },

      
      { $set: {
          [field]: {
            $function: {
              lang: 'js',
              args: [ '$__src', accentMap ],
              body: function (s, map) {
                s = s.toLowerCase();
                s = s.replace(/[áàâäãåéèêëíìîïóòôöõúùûüçñýÿ]/g,
                              ch => map[ch]);
                s = s.replace(/[^a-z0-9'\\s]/g, '');
                return s.trim();
              }
            }
          }
      }},

     
      { $unset: '__src' }
    ]
  );
});

print('\n--- Normalisation terminée ---');
