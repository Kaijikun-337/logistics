/**
 * Compact gazetteer used only for guessing which anonymous column holds a
 * place name. It is deliberately biased towards freight hubs and sea/air ports
 * rather than being a complete world gazetteer.
 */
const PLACES = [
  // Europe
  "amsterdam", "rotterdam", "antwerp", "zeebrugge", "hamburg", "bremerhaven", "bremen", "le havre", "dunkirk",
  "marseille", "lyon", "paris", "bordeaux", "barcelona", "madrid", "valencia", "bilbao", "porto", "lisbon",
  "leixoes", "milan", "rome", "genoa", "naples", "trieste", "verona", "berlin", "munich", "frankfurt", "stuttgart",
  "cologne", "dusseldorf", "warsaw", "krakow", "gdansk", "gdynia", "prague", "vienna", "salzburg", "zurich",
  "basel", "geneva", "oslo", "bergen", "stockholm", "gothenburg", "malmo", "copenhagen", "aarhus", "helsinki",
  "dublin", "cork", "london", "leeds", "manchester", "birmingham", "glasgow", "liverpool", "bristol", "southampton",
  "felixstowe", "london gateway", "belfast", "cardiff", "edinburgh", "istanbul", "izmir", "mersin", "athens",
  "piraeus", "thessaloniki", "belgrade", "bucharest", "constanta", "sofia", "kyiv", "odesa", "moscow",
  "st petersburg", "riga", "klaipeda", "tallinn", "luxembourg", "brussels", "ghent", "liege", "lyon",
  // Middle East & Africa
  "dubai", "jebel ali", "abu dhabi", "sharjah", "doha", "riyadh", "jeddah", "dammam", "kuwait", "manama",
  "muscat", "sohar", "amman", "beirut", "haifa", "ashdod", "cairo", "alexandria", "port said", "casablanca",
  "tanger", "tangier", "agadir", "algiers", "oran", "tunis", "sousse", "tripoli", "benghazi", "lagos", "apapa",
  "tin can island", "tema", "takoradi", "abidjan", "dakar", "accra", "mombasa", "nairobi", "dar es salaam",
  "addis ababa", "djibouti", "durban", "cape town", "johannesburg", "port elizabeth", "luanda", "walvis bay",
  // South & Southeast Asia
  "mumbai", "nhava sheva", "chennai", "delhi", "new delhi", "kolkata", "bangalore", "bengaluru", "cochin",
  "coimbatore", "ahmedabad", "mundra", "pipavav", "hyderabad", "karachi", "qasim", "chittagong", "dhaka",
  "colombo", "singapore", "port klang", "penang", "tanjung pelepas", "pasir gudang", "jakarta", "surabaya",
  "belawan", "bangkok", "laem chabang", "ho chi minh", "haiphong", "cai mep", "manila", "subic", "cebu",
  // East Asia & Oceania
  "hong kong", "shanghai", "ningbo", "shenzhen", "yantian", "guangzhou", "xiamen", "qingdao", "tianjin",
  "dalian", "beijing", "busan", "incheon", "tokyo", "yokohama", "nagoya", "osaka", "kobe", "taipei",
  "kaohsiung", "keelung", "sydney", "melbourne", "brisbane", "fremantle", "adelaide", "auckland", "tauranga",
  // Americas
  "los angeles", "long beach", "oakland", "seattle", "tacoma", "portland", "vancouver", "prince rupert",
  "new york", "newark", "savannah", "charleston", "miami", "houston", "new orleans", "norfolk", "baltimore",
  "philadelphia", "boston", "chicago", "detroit", "columbus", "dallas", "laredo", "el paso", "atlanta",
  "memphis", "louisville", "kansas city", "denver", "phoenix", "salt lake city", "minneapolis", "toronto",
  "montreal", "calgary", "winnipeg", "mexico city", "monterrey", "guadalajara", "manzanillo", "lazaro cardenas",
  "veracruz", "santos", "rio de janeiro", "sao paulo", "paranagua", "buenos aires", "montevideo", "valparaiso",
  "san antonio", "callao", "lima", "bogota", "cartagena", "barranquilla", "guayaquil", "quito", "la paz",
  "santiago", "asuncion",
];

const PLACE_INDEX = new Set(PLACES);

/** Very common country names + ISO-2/ISO-3 codes, used as a secondary signal. */
const COUNTRIES = [
  "netherlands", "holland", "belgium", "germany", "france", "spain", "portugal", "italy", "poland", "czechia",
  "czech republic", "austria", "switzerland", "norway", "sweden", "denmark", "finland", "ireland", "united kingdom",
  "uk", "great britain", "england", "scotland", "wales", "turkey", "türkiye", "greece", "romania", "bulgaria",
  "serbia", "ukraine", "russia", "latvia", "lithuania", "estonia", "luxembourg", "united states", "usa", "us",
  "canada", "mexico", "brazil", "argentina", "chile", "peru", "colombia", "ecuador", "uruguay", "paraguay",
  "bolivia", "uae", "united arab emirates", "saudi arabia", "qatar", "kuwait", "bahrain", "oman", "jordan",
  "lebanon", "israel", "egypt", "morocco", "algeria", "tunisia", "libya", "nigeria", "ghana", "ivory coast",
  "senegal", "kenya", "tanzania", "ethiopia", "djibouti", "south africa", "namibia", "angola", "india", "pakistan",
  "bangladesh", "sri lanka", "singapore", "malaysia", "indonesia", "thailand", "vietnam", "philippines",
  "hong kong", "china", "taiwan", "south korea", "korea", "japan", "australia", "new zealand", "nl", "be", "de",
  "fr", "es", "pt", "it", "pl", "at", "ch", "no", "se", "dk", "fi", "ie", "gb", "tr", "gr", "ro", "ua", "us",
  "ca", "mx", "br", "ar", "cl", "pe", "co", "ae", "sa", "qa", "eg", "ma", "ng", "gh", "ke", "za", "in", "pk",
  "bd", "lk", "sg", "my", "id", "th", "vn", "ph", "cn", "tw", "kr", "jp", "au", "nz", "hk",
];

const COUNTRY_INDEX = new Set(COUNTRIES);

/** "Rotterdam", "Rotterdam, NL", "NL", "Port of Rotterdam" all look like places. */
export function looksLikePlace(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[.\-_/]/g, " ")
    .replace(/\b(port|airport|terminal|city|of|the|de|del|la|le|du)\b/g, " ")
    .replace(/[^a-z0-9,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (PLACE_INDEX.has(normalized) || COUNTRY_INDEX.has(normalized)) return true;

  const firstSegment = normalized.split(",")[0]?.trim();
  if (firstSegment && (PLACE_INDEX.has(firstSegment) || COUNTRY_INDEX.has(firstSegment))) return true;

  // "Somewhere, NL" — a comma followed by a short code is a strong place pattern.
  if (/^[a-z][a-z .'-]+,\s*[a-z]{2,3}$/.test(normalized)) return true;

  const words = normalized.split(" ");
  if (words.length >= 2 && words.length <= 4) {
    const knownWords = words.filter((word) => PLACE_INDEX.has(word) || COUNTRY_INDEX.has(word)).length;
    if (knownWords >= 1) return true;
  }

  return false;
}
