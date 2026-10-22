/**
 * The supplied Gross Board screenshot as a matrix, so the dashboard can be
 * tried without a file. Same shape the parser has to cope with:
 * banner row, unlabelled column D, `12 October` headers, merged identity cells,
 * a fleet-totals row, a totals-only "Brett" rollup, statuses written into the
 * Load # row, and totals on the third sub-row.
 */
export const GROSS_BOARD_SAMPLE: string[][] = [
  ["", "See Gross Archive", "Dont use comments. Use notes. comments not saved in archive", "", "", "", "", "", "", "", "", "", "", "", ""],
  [
    "",
    "Driver Name",
    "Truck #",
    "",
    "12 October",
    "13 October",
    "14 October",
    "15 October",
    "16 October",
    "17 October",
    "18 October",
    "Total $",
    "Total Mile",
    "Per Mile",
    "Manager's Comments",
  ],
  ["", "", "", "", "", "", "", "", "", "", "", "$40,825", "13,598", "$3.00", ""],
  ["", "Brett", "", "", "", "", "", "", "", "", "", "$40,825", "13,598", "$3.00", ""],

  // 1 — DEXTER SISTRUNK
  ["1", "DEXTER SISTRUNK", "# 105829", "Rate", "$1,600", "$1,800", "$1,350", "$950", "", "$1,300", "$1,200", "", "", "", ""],
  ["", "", "", "Mile", "427", "450", "228", "329", "", "395", "342", "", "", "", ""],
  ["", "", "", "Load #", "1762990", "0247304", "9821299", "9490029", "HOME", "0248466", "0248482", "$8,200", "2,171", "$3.78", ""],

  // 2 — SANDERS ANTHONY
  ["2", "SANDERS ANTHONY", "# 4260", "Rate", "", "$3,750", "", "$2,400", "", "$4,350", "", "", "", "", ""],
  ["", "", "", "Mile", "", "1,077", "", "814", "", "1,709", "", "", "", "", ""],
  ["", "", "", "Load #", "HOME", "1160719", "ENROUTE", "11308", "69576974", "", "ENROUTE", "$10,500", "3,600", "$2.92", ""],

  // 3 — ANDRE JUNIOR VALLON
  ["3", "ANDRE JUNIOR VALLON", "# 9908", "Rate", "ENROUTE", "$1,800", "$2,600", "Wanted to rest", "5500", "", "", "", "", "", ""],
  ["", "", "", "Mile", "", "697", "1,180", "2,083", "", "", "", "", "", "", ""],
  ["", "", "", "Load #", "", "LD73674", "9782283", "1756346", "", "", "ENROUTE", "$9,900", "3,960", "$2.50", "-"],

  // 4 — GONZALEZ BRYANT & RODRIGUEZ TAMARA
  ["4", "GONZALEZ BRYANT & RODRIGUEZ TAMARA", "# 102", "Rate", "$4,500", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "Mile", "1,235", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "Load #", "830523", "ENROUTE", "HOME", "", "", "", "", "$4,500", "1,235", "$3.64", ""],

  // 5 — (CD) LEWIS THOMAS
  ["5", "(CD) LEWIS THOMAS", "# 249", "Rate", "$1,025", "", "$2,700", "", "$4,000", "", "", "", "", "", ""],
  ["", "", "", "Mile", "410", "", "913", "", "1,309", "", "", "", "", "", ""],
  ["", "", "", "Load #", "5451683", "WAITED FOR CO-DRIVER", "1160707", "OOS", "1400461", "", "ENROUTE", "$7,725", "2,632", "$2.94", ""],
];

export const GROSS_BOARD_SAMPLE_FILE = "gross board week 42.xlsx";
