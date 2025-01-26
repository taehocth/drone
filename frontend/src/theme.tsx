import { extendTheme } from "@chakra-ui/react"
import "@fontsource/pretendard"

const disabledStyles = {
  _disabled: {
    backgroundColor: "ui.main",
  },
}

const theme = extendTheme({
  fonts: {
    heading: "pretendard",
    body: "pretendard",
  },
  textStyles: {
    h1: {
      fontSize: ["24px", "30px"],
      fontWeight: "bold",
      lineHeight: "1.3",
      letterSpacing: "-2%",
    },
    h2: {
      fontSize: ["18px", "20px"],
      fontWeight: "bold",
      lineHeight: "1.3",
      letterSpacing: "-1%",
    },
  },
  colors: {
    ui: {
      main: "#009688",
      secondary: "#EDF2F7",
      success: "#48BB78",
      danger: "#E53E3E",
      light: "#FAFAFA",
      dark: "#1A202C",
      darkSlate: "#252D3D",
      dim: "#A0AEC0",
    },
  },
  components: {
    Button: {
      variants: {
        primary: {
          backgroundColor: "ui.main",
          color: "ui.light",
          _hover: {
            backgroundColor: "#00766C",
          },
          _disabled: {
            ...disabledStyles,
            _hover: {
              ...disabledStyles,
            },
          },
        },
        danger: {
          backgroundColor: "ui.danger",
          color: "ui.light",
          _hover: {
            backgroundColor: "#E32727",
          },
        },
      },
    },
    Tabs: {
      variants: {
        enclosed: {
          tab: {
            _selected: {
              color: "ui.main",
            },
          },
        },
      },
    },
  },
})

export default theme
