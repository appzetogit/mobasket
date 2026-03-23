function matchesRouteRoot(pathname = "", routeRoot = "") {
  return pathname === routeRoot || pathname.startsWith(`${routeRoot}/`);
}

export function isNonUserPanelPath(pathname = "") {
  return (
    matchesRouteRoot(pathname, "/admin") ||
    matchesRouteRoot(pathname, "/delivery") ||
    matchesRouteRoot(pathname, "/restaurant") ||
    matchesRouteRoot(pathname, "/store")
  );
}

export function shouldApplyUserDarkTheme(pathname = "", theme = "light") {
  return theme === "dark" && !isNonUserPanelPath(pathname);
}

export function applyScopedAppTheme(pathname = "", theme = "light") {
  if (typeof document === "undefined") return false;

  const shouldUseDarkTheme = shouldApplyUserDarkTheme(pathname, theme);
  document.documentElement.classList.toggle("dark", shouldUseDarkTheme);

  return shouldUseDarkTheme;
}
