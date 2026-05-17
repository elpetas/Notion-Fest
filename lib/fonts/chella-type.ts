import { Bebas_Neue } from "next/font/google";

/**
 * Display face for hero / branding (Notionchella wordmark).
 * To use Chella Type instead, add `app/fonts/ChellaType-Regular.ttf` and switch
 * this module to `next/font/local` with `src: "../../app/fonts/ChellaType-Regular.ttf"`.
 */
export const chellaType = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});
