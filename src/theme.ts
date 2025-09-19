import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  components: {
    MuiBackButton: {
      styleOverrides: {
        root: {
          color: 'primary.main',
        }
      }
    }
  },
  // Other theme configurations...
}); 