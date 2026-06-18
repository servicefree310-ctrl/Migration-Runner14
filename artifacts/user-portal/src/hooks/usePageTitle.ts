import { useEffect } from "react";

const BRAND = "Zebvix";

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${BRAND}` : `${BRAND} Exchange`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
