import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2364aa"
    },
    background: {
      default: "#f5f7f8",
      paper: "#ffffff"
    },
    text: {
      primary: "#172026",
      secondary: "#667985"
    },
    success: {
      main: "#2e7d32"
    },
    warning: {
      main: "#ed6c02"
    },
    error: {
      main: "#b3261e"
    }
  },
  shape: {
    borderRadius: 8
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontSize: 30,
      fontWeight: 800,
      letterSpacing: 0
    },
    h2: {
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: 0
    },
    button: {
      textTransform: "none",
      fontWeight: 700
    }
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none"
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: "#667985",
          fontSize: 12,
          fontWeight: 800,
          textTransform: "uppercase"
        }
      }
    }
  }
});
