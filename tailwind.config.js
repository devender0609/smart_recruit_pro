/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {50:"#f0f7ff",100:"#dbeeff",200:"#bfe0ff",300:"#93caff",400:"#5faaff",500:"#2b89ff",
                600:"#0867e6",700:"#064fba",800:"#083f8f",900:"#0a356f"}
      },
      boxShadow: { soft: "0 10px 25px rgba(0,0,0,0.08)" },
      borderRadius: { xl: "1rem" }
    }
  },
  plugins: [],
};
