import { mogroceryMenuData, sidebarMenuData } from "./sidebarMenu";

const SUPER_ADMIN_ONLY_PATHS = new Set(["/admin/manage-admin"]);

const flattenMenuAccess = (menu, platform) => {
  const groups = [];
  const generalOptions = [];

  menu.forEach((entry) => {
    if (entry?.type === "link" && entry.path) {
      if (SUPER_ADMIN_ONLY_PATHS.has(entry.path)) return;
      generalOptions.push({ label: entry.label || entry.path, path: entry.path, platform });
      return;
    }

    if (entry?.type !== "section" || !Array.isArray(entry.items)) return;
    const options = [];

    entry.items.forEach((item) => {
      if (item?.type === "link" && item.path) {
        if (SUPER_ADMIN_ONLY_PATHS.has(item.path)) return;
        options.push({ label: item.label || item.path, path: item.path, platform });
        return;
      }

      if (item?.type === "expandable" && Array.isArray(item.subItems)) {
        item.subItems.forEach((subItem) => {
          if (!subItem?.path) return;
          if (SUPER_ADMIN_ONLY_PATHS.has(subItem.path)) return;
          options.push({
            label: `${item.label} - ${subItem.label || subItem.path}`,
            path: subItem.path,
            platform,
          });
        });
      }
    });

    if (options.length > 0) {
      groups.push({ group: entry.label || "Section", options });
    }
  });

  if (generalOptions.length > 0) {
    groups.unshift({ group: "General", options: generalOptions });
  }

  return groups;
};

export const adminAccessOptions = {
  mofood: flattenMenuAccess(sidebarMenuData, "mofood"),
  mogrocery: flattenMenuAccess(mogroceryMenuData, "mogrocery"),
};

const dedupe = new Set();
Object.values(adminAccessOptions).forEach((groups) => {
  groups.forEach((group) => {
    group.options.forEach((option) => {
      if (option?.path) dedupe.add(option.path);
    });
  });
});

export const allAdminAccessPaths = Array.from(dedupe);

