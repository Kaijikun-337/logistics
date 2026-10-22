/**
 * A deliberately realistic — and slightly messy — freight manifest used for the
 * "Load demo manifest" affordance so the parser can be tried without a file.
 */
const SAMPLE_HEADERS = [
  "Shipment ID",
  "Customer",
  "Origin",
  "Destination",
  "Carrier",
  "Mode",
  "Status",
  "Pickup Date",
  "ETA",
  "Weight (kg)",
  "Pieces",
  "Freight Cost",
  "Currency",
  "Driver",
  "Exception Notes",
];

const SAMPLE_ROWS: string[][] = [
  ["MW-10482", "Northwind Retail", "Rotterdam, NL", "Leeds, UK", "Mareline Freight", "Ocean", "Delivered", "2026-02-02", "2026-02-07", "12400", "480", "8420", "EUR", "R. Okafor", ""],
  ["MW-10483", "Cobalt Foods", "Lyon, FR", "Barcelona, ES", "TransAlpin", "Road", "In transit", "2026-02-11", "2026-02-14", "8900", "320", "3150", "EUR", "L. Brun", ""],
  ["MW-10484", "Halcyon Labs", "Singapore, SG", "Chennai, IN", "Meridian Air", "Air", "Delayed", "2026-02-09", "2026-02-12", "640", "12", "6180", "USD", "A. Rahim", "Customs clearance backlog at origin"],
  ["MW-10485", "Vertex Auto", "Detroit, US", "Monterrey, MX", "Rio Grande Logistics", "Road", "In transit", "2026-02-12", "2026-02-18", "18600", "26", "7420", "USD", "J. Ibarra", ""],
  ["MW-10486", "Northwind Retail", "Shenzhen, CN", "Hamburg, DE", "Hanseatic Line", "Ocean", "Delivered", "2026-01-21", "2026-02-16", "22400", "980", "15600", "USD", "K. Maier", ""],
  ["MW-10487", "Bluepeak Pharma", "Basel, CH", "Milan, IT", "TransAlpin", "Road", "Delivered", "2026-02-05", "2026-02-06", "2100", "84", "1180", "EUR", "M. Rossi", "Temperature log attached"],
  ["MW-10488", "Tidewater Supply", "Houston, US", "Cartagena, CO", "Gulf Stream Cargo", "Ocean", "Exception", "2026-02-03", "2026-02-15", "16200", "310", "9880", "USD", "T. Osei", "Container damaged in transshipment"],
  ["MW-10489", "Cobalt Foods", "Lyon, FR", "Antwerp, BE", "Rhine Express", "Rail", "Pending", "2026-02-17", "2026-02-19", "7400", "260", "2240", "EUR", "", "Awaiting pickup window confirmation"],
  ["MW-10490", "Halcyon Labs", "Penang, MY", "Singapore, SG", "Meridian Air", "Air", "In transit", "2026-02-13", "2026-02-13", "320", "8", "1460", "SGD", "S. Tan", ""],
  ["MW-10491", "Orchard Home", "Valencia, ES", "Paris, FR", "Iberia Roadways", "Road", "Delivered", "2026-01-28", "2026-01-31", "5200", "410", "2480", "EUR", "P. Garnier", ""],
  ["MW-10492", "Vertex Auto", "Nagoya, JP", "Busan, KR", "Pacific Bridge", "Ocean", "Delayed", "2026-02-06", "2026-02-11", "19800", "150", "6740", "USD", "H. Sato", "Vessel rolled to next sailing"],
  ["MW-10493", "Northwind Retail", "Leeds, UK", "Glasgow, UK", "Caledonia Haulage", "Road", "Delivered", "2026-02-10", "2026-02-10", "3600", "180", "890", "GBP", "E. Whitcombe", ""],
  ["MW-10494", "Bluepeak Pharma", "Frankfurt, DE", "Dubai, AE", "Meridian Air", "Air", "Pending", "2026-02-18", "2026-02-20", "410", "16", "5240", "USD", "", "Export licence pending"],
  ["MW-10495", "Tidewater Supply", "Long Beach, US", "Yokohama, JP", "Pacific Bridge", "Ocean", "Delivered", "2026-01-19", "2026-02-08", "24300", "720", "17400", "USD", "B. Nakamura", ""],
  ["MW-10496", "Orchard Home", "Porto, PT", "Madrid, ES", "Iberia Roadways", "Road", "In transit", "2026-02-12", "2026-02-15", "4700", "340", "1980", "EUR", "C. Silva", ""],
  ["MW-10497", "Vertex Auto", "Stuttgart, DE", "Kraków, PL", "Rhine Express", "Rail", "Exception", "2026-02-04", "2026-02-08", "11200", "48", "4380", "EUR", "W. Kowalski", "Missing customs paperwork, held at border"],
  ["MW-10498", "Cobalt Foods", "Marseille, FR", "Tunis, TN", "Mareline Freight", "Ocean", "Delivered", "2026-01-25", "2026-02-01", "9800", "390", "5620", "EUR", "N. Ben Ali", ""],
  ["MW-10499", "Northwind Retail", "Shanghai, CN", "Sydney, AU", "Coral Sea Logistics", "Ocean", "In transit", "2026-02-08", "2026-02-22", "18600", "640", "12900", "USD", "F. Zhou", ""],
  ["MW-10482", "Northwind Retail", "Rotterdam, NL", "Leeds, UK", "Mareline Freight", "Ocean", "Delivered", "2026-02-02", "2026-02-07", "12400", "480", "8420", "EUR", "R. Okafor", "Possible re-entry of previous line"],
  ["MW-10500", "Halcyon Labs", "Zurich, CH", "Oslo, NO", "Nordic Air Cargo", "Air", "Pending", "2026-02-19", "2026-02-21", "280", "6", "3980", "EUR", "", ""],
];

export const SAMPLE_MANIFEST_MATRIX: string[][] = [SAMPLE_HEADERS, ...SAMPLE_ROWS];

export const SAMPLE_TSV: string = SAMPLE_MANIFEST_MATRIX.map((row) => row.join("\t")).join("\n");

export const SAMPLE_FILE_NAME = "northwind_feb_manifest.xlsx";

/**
 * A sideways lane scorecard: dates run across the top and the metrics
 * (Rate / Miles / Loads) run down the first column. Importing this shows the
 * orientation step in action without needing a real file.
 */
export const SIDEWAYS_SAMPLE_MATRIX: string[][] = [
  ["LANE SCORECARD — ROTTERDAM → LEEDS"],
  [],
  ["Metric", "Mon 02 Feb", "Tue 03 Feb", "Wed 04 Feb", "Thu 05 Feb", "Fri 06 Feb", "Sat 07 Feb", "Sun 08 Feb"],
  ["Rate", "842", "815", "798", "860", "875", "910", "795"],
  ["Miles", "412", "412", "418", "412", "405", "412", "412"],
  ["Loads", "3", "2", "4", "3", "5", "1", "2"],
  ["Fuel surcharge", "64", "61", "60", "65", "66", "69", "60"],
  ["On time %", "96", "100", "92", "88", "100", "100", "75"],
];

export const SIDEWAYS_SAMPLE_FILE_NAME = "lane_scorecard_rotterdam_leeds.xlsx";
