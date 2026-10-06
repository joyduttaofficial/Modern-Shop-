import React from "react";
import defaultStoreLogo from "../assets/images/modern_cloth_store_logo.png";

interface AppLogoProps {
  src?: string | null;
  alt?: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  rounded?: "md" | "lg" | "xl" | "2xl" | "full";
  withBorder?: boolean;
}

const SIZE_MAP = {
  xs: "w-6 h-6",
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
};

const ROUNDED_MAP = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

export default function AppLogo({
  src,
  alt = "Modern Cloth Store Logo",
  className = "",
  size = "md",
  rounded = "xl",
  withBorder = true,
}: AppLogoProps) {
  const [imgSrc, setImgSrc] = React.useState<string>(src || defaultStoreLogo);

  React.useEffect(() => {
    if (src) {
      setImgSrc(src);
    } else {
      setImgSrc(defaultStoreLogo);
    }
  }, [src]);

  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;
  const roundedClass = ROUNDED_MAP[rounded] || ROUNDED_MAP.xl;
  const borderClass = withBorder ? "border border-slate-100 shadow-xs bg-white" : "bg-white";

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={`${sizeClass} ${roundedClass} ${borderClass} object-contain shrink-0 select-none ${className}`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (imgSrc !== defaultStoreLogo) {
          setImgSrc(defaultStoreLogo);
        }
      }}
    />
  );
}

export { defaultStoreLogo };
