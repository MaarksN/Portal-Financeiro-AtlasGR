export const atlasGrBrand = {
  colors: {
    orange: "#FF5618",
    white: "#FFFFFF",
    graphite: "#333333",
    yellow: "#FFC500",
    orangeMedium: "#FF8008",
    orangeSupport: "#FF6B10",
  },
  typography: {
    primary: '"Mont", "Montserrat", Arial, sans-serif',
    secondary: '"Montserrat", Arial, sans-serif',
  },
  logo: {
    minimumDigitalWidth: { symbol: 14, primary: 56, withTagline: 114 },
    applicationIconSizes: [40, 60, 80],
  },
} as const;

export type AtlasGrBrand = typeof atlasGrBrand;

