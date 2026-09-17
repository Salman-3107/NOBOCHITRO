// Country -> ISO 3166-1 alpha-2, so the passport can show a real flag image
// instead of a flag emoji. Emoji flags are the obvious choice until you open
// the app on Windows, where Chrome renders them as two grey letters -- the
// one platform the demo will actually run on. Images render everywhere.
const COUNTRY_CODES = {
  usa: 'us', 'united states': 'us', 'united states of america': 'us', america: 'us',
  uk: 'gb', 'united kingdom': 'gb', england: 'gb', britain: 'gb', scotland: 'gb',
  india: 'in', bangladesh: 'bd', pakistan: 'pk', 'sri lanka': 'lk', nepal: 'np',
  japan: 'jp', 'south korea': 'kr', korea: 'kr', 'north korea': 'kp',
  china: 'cn', 'hong kong': 'hk', taiwan: 'tw', singapore: 'sg',
  france: 'fr', germany: 'de', italy: 'it', spain: 'es', portugal: 'pt',
  netherlands: 'nl', holland: 'nl', belgium: 'be', switzerland: 'ch', austria: 'at',
  sweden: 'se', denmark: 'dk', norway: 'no', finland: 'fi', iceland: 'is',
  poland: 'pl', 'czech republic': 'cz', czechia: 'cz', hungary: 'hu', romania: 'ro',
  greece: 'gr', russia: 'ru', ukraine: 'ua', turkey: 'tr', ireland: 'ie',
  canada: 'ca', mexico: 'mx', brazil: 'br', argentina: 'ar', chile: 'cl',
  colombia: 'co', peru: 'pe', cuba: 'cu',
  australia: 'au', 'new zealand': 'nz',
  iran: 'ir', iraq: 'iq', israel: 'il', 'saudi arabia': 'sa', 'united arab emirates': 'ae',
  egypt: 'eg', morocco: 'ma', tunisia: 'tn', algeria: 'dz',
  'south africa': 'za', nigeria: 'ng', kenya: 'ke', ghana: 'gh', senegal: 'sn',
  thailand: 'th', vietnam: 'vn', indonesia: 'id', malaysia: 'my', philippines: 'ph',
  afghanistan: 'af', bhutan: 'bt', myanmar: 'mm', maldives: 'mv',
};

export function countryCode(country) {
  if (!country) return null;
  return COUNTRY_CODES[country.trim().toLowerCase()] || null;
}

// flagcdn serves plain PNGs over https with no key and no rate limit worth
// worrying about. `size` is the CDN's width bucket: w80 for stamps, w320 for
// the big banner so it doesn't look soft when it's blown up.
export function flagUrl(country, size = 'w160') {
  const code = countryCode(country);
  return code ? `https://flagcdn.com/${size}/${code}.png` : null;
}

// Shown in place of the image for a country that isn't in the table above,
// and as the fallback when the CDN can't be reached at all.
export const FLAG_FALLBACK = '\u{1F39E}\uFE0F';
