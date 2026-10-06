// All figures are approximate, rounded values from the sources named below.
// Check them against the latest editions before final submission.

const DATA = {
  // Carbon emission factors (kg CO2e)
  carbon: {
    // per km travelled; sources: DEFRA / India GHG Program approximations
    transport: {
      car: 0.17,
      bike: 0.05,
      bus: 0.09,
      train: 0.04,
      flight: 0.15
    },
    gridKgPerKwh: 0.71,        // India grid average, Central Electricity Authority
    wasteKgPerKg: 0.45,        // landfill emissions per kg of mixed waste
    recycleSaving: 0.5,        // share of waste emissions avoided when recycled
    dietTonnes: {              // per year; Scarborough et al., 2014
      vegan: 1.5,
      vegetarian: 1.7,
      mixed: 2.5,
      meat: 3.3
    },
    averages: { India: 2.0, World: 4.7 } // tonnes CO2 per person per year, Our World in Data / Global Carbon Project
  },

  // Virtual water in litres per unit; source: Water Footprint Network (Mekonnen & Hoekstra)
  water: [
    { id: "sugar",   name: "Sugar",             unit: "kg",     litres: 1780,  swap: "Cut back on sweets and sugary drinks; have fruit instead" },
    { id: "chicken", name: "Chicken",           unit: "kg",     litres: 4300,  swap: "Try pulses or tofu" },
    { id: "rice",    name: "Rice",              unit: "kg",     litres: 2500,  swap: "Mix in millets, which need far less water" },
    { id: "bread",   name: "Bread",             unit: "kg",     litres: 1600,  swap: "Avoid wasting bread; use leftovers" },
    { id: "egg",     name: "Egg",               unit: "egg",    litres: 196,   swap: "Plant protein uses less water" },
    { id: "milk",    name: "Milk",              unit: "litre",  litres: 1000,  swap: "Buy only what you will finish" },
    { id: "coffee",  name: "Coffee",            unit: "cup",    litres: 132,   swap: "Tea uses about 27 L per cup" },
    { id: "choc",    name: "Chocolate",         unit: "kg",     litres: 17000, swap: "Eat it as an occasional treat" },
    { id: "tshirt",  name: "Cotton T-shirt",    unit: "piece",  litres: 2700,  swap: "Buy second-hand or wear it longer" },
    { id: "jeans",   name: "Jeans",             unit: "pair",   litres: 10000, swap: "Repair, swap or thrift" },
    { id: "phone",   name: "Smartphone",        unit: "phone",  litres: 12000, swap: "Keep your phone for an extra year" },
    { id: "paper",   name: "A4 paper",          unit: "sheet",  litres: 10,    swap: "Print on both sides or go digital" }
  ],
  drinkingLitresPerDay: 3,

  // Chart data (approximate)
  temperature: {
    // Global temperature rise vs 1951-1980 average, deg C; source: NASA GISS
    labels: [1980, 1990, 2000, 2010, 2016, 2020, 2023],
    values: [0.26, 0.45, 0.42, 0.72, 1.01, 1.02, 1.17]
  },
  plastic: {
    // Global plastic production, million tonnes; source: Our World in Data
    labels: [1950, 1970, 1990, 2000, 2010, 2019],
    values: [2, 35, 120, 234, 313, 460]
  },
  countries: {
    // CO2 per person per year, tonnes (approx, recent years); source: Our World in Data
    labels: ["India", "World", "EU", "China", "USA"],
    values: [2.0, 4.7, 5.7, 8.0, 14.9]
  },
  facts: [
    { big: "2.4 billion", text: "people live in water-stressed countries (UN-Water)" },
    { big: "70%", text: "of global freshwater withdrawals go to agriculture (FAO)" },
    { big: "~1.1 °C", text: "of warming above pre-industrial levels so far (IPCC)" },
    { big: "~8 million", text: "tonnes of plastic enter the oceans every year (UNEP)" }
  ]
};
