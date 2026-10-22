"use client";

import type { ReactNode } from "react";
import { useCatalogTheme } from "../store/useCatalogTheme";
import s from "./admin-theme.module.css";

export default function AdminTheme({ children }: { children: ReactNode }) {
  const { theme } = useCatalogTheme();
  return <div className={s.scope} data-admin-theme={theme}>{children}</div>;
}
